package persistence

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"portfolio-dashboard/internal/domain"
)

// OverallStore owns portfolio_overall (PD-059 / DD-015 §2.2): one small
// document per (user, day) with the day's EUR→INR rate and the stock
// buckets converted to INR. Only SnapshotStore writes it on the live path;
// the backfill and the rebuild write it from cmd. Every method names the
// owner.
type OverallStore struct {
	col *mongo.Collection
}

func overallFilter(userId primitive.ObjectID, date time.Time) bson.M {
	return bson.M{"user_id": userId, "date": domain.UTCDate(date)}
}

// overallUpdate is the $set / $unset for a day's rate and the totals
// computed from buckets at that rate. A nil value is unset, never stored as
// zero.
func overallUpdate(rate domain.FxRate, buckets map[string]domain.RegionSnapshot) bson.M {
	invested, current := domain.OverallFromBuckets(buckets, rate.EurInr)
	set := bson.M{"fx_carried": rate.Carried, "updated_at": time.Now().UTC()}
	unset := bson.M{}
	putOrUnset(set, unset, "eur_inr", rate.EurInr)
	putOrUnset(set, unset, "stocks_invested_inr", invested)
	putOrUnset(set, unset, "stocks_current_inr", current)
	if rate.FxDate != "" {
		set["fx_date"] = rate.FxDate
	} else {
		unset["fx_date"] = ""
	}
	update := bson.M{"$set": set}
	if len(unset) > 0 {
		update["$unset"] = unset
	}
	return update
}

func putOrUnset(set, unset bson.M, field string, value *float64) {
	if value != nil {
		set[field] = *value
		return
	}
	unset[field] = ""
}

// Put writes the day's rate and the totals computed from buckets at that
// rate, creating the document when absent.
func (s *OverallStore) Put(ctx context.Context, userId primitive.ObjectID, date time.Time, rate domain.FxRate, buckets map[string]domain.RegionSnapshot) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	_, err := s.col.UpdateOne(ctx, overallFilter(userId, date), overallUpdate(rate, buckets), options.Update().SetUpsert(true))
	return err
}

// RefreshStocks recomputes the day's totals from buckets at the rate the
// document already stores, in one pipeline update, so no read is needed. A
// day with no document yet (a History add or paste for a new date) gets one
// with no rate and fx_carried = true: its totals are known when it holds no
// EUR, and otherwise it is offered for re-fetch on History (DD-015 §2.7).
func (s *OverallStore) RefreshStocks(ctx context.Context, userId primitive.ObjectID, date time.Time, buckets map[string]domain.RegionSnapshot) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	inr, eur := buckets[domain.CurrencyINR], buckets[domain.CurrencyEUR]
	now := time.Now().UTC()
	upsert := options.Update().SetUpsert(true)
	if eur.Invested == 0 && eur.Current == 0 {
		invested, current := domain.OverallFromBuckets(buckets, nil)
		_, err := s.col.UpdateOne(ctx, overallFilter(userId, date), bson.M{
			"$set":         bson.M{"stocks_invested_inr": *invested, "stocks_current_inr": *current, "updated_at": now},
			"$setOnInsert": bson.M{"fx_carried": true},
		}, upsert)
		return err
	}
	convert := func(inrAmount, eurAmount float64) bson.M {
		return bson.M{"$cond": bson.A{
			bson.M{"$gt": bson.A{bson.M{"$ifNull": bson.A{"$eur_inr", 0}}, 0}},
			bson.M{"$round": bson.A{bson.M{"$add": bson.A{inrAmount, bson.M{"$multiply": bson.A{eurAmount, "$eur_inr"}}}}, 2}},
			"$$REMOVE",
		}}
	}
	pipeline := mongo.Pipeline{{{Key: "$set", Value: bson.M{
		"stocks_invested_inr": convert(inr.Invested, eur.Invested),
		"stocks_current_inr":  convert(inr.Current, eur.Current),
		// A new document has no rate yet: flag it for re-fetch.
		"fx_carried": bson.M{"$ifNull": bson.A{"$fx_carried", true}},
		"updated_at": now,
	}}}}
	_, err := s.col.UpdateOne(ctx, overallFilter(userId, date), pipeline, upsert)
	return err
}

// FillUnrated writes the day's rate and totals only when the day has no
// document or one without a rate (e.g. created by a History add before the
// backfill ran). A document that already has a rate — written live by the
// snapshot job — is never touched: the filter misses it, the upsert's insert
// collides on the unique (user_id, date) index, and that duplicate means
// "already rated". Reports whether it wrote.
func (s *OverallStore) FillUnrated(ctx context.Context, userId primitive.ObjectID, date time.Time, rate domain.FxRate, buckets map[string]domain.RegionSnapshot) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	filter := overallFilter(userId, date)
	filter["eur_inr"] = bson.M{"$exists": false}
	_, err := s.col.UpdateOne(ctx, filter, overallUpdate(rate, buckets), options.Update().SetUpsert(true))
	if mongo.IsDuplicateKeyError(err) {
		return false, nil
	}
	return err == nil, err
}

// Get returns one day's document, or ErrNotFound.
func (s *OverallStore) Get(ctx context.Context, userId primitive.ObjectID, date time.Time) (domain.OverallDay, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()
	var day domain.OverallDay
	if err := s.col.FindOne(ctx, overallFilter(userId, date)).Decode(&day); err != nil {
		return domain.OverallDay{}, translateFindErr(err)
	}
	return day, nil
}

// List returns the user's documents in [from, to], oldest first.
func (s *OverallStore) List(ctx context.Context, userId primitive.ObjectID, from, to time.Time) ([]domain.OverallDay, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()
	filter := bson.M{"user_id": userId, "date": bson.M{"$gte": domain.UTCDate(from), "$lte": domain.UTCDate(to)}}
	cursor, err := s.col.Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "date", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer func() { _ = cursor.Close(ctx) }()
	var days []domain.OverallDay
	if err := cursor.All(ctx, &days); err != nil {
		return nil, err
	}
	return days, nil
}

// LatestBefore returns the user's newest document dated before date, the
// rate a weekend or a failed fetch carries forward. ErrNotFound when none.
func (s *OverallStore) LatestBefore(ctx context.Context, userId primitive.ObjectID, date time.Time) (domain.OverallDay, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()
	filter := bson.M{"user_id": userId, "date": bson.M{"$lt": domain.UTCDate(date)}}
	var day domain.OverallDay
	err := s.col.FindOne(ctx, filter, options.FindOne().SetSort(bson.D{{Key: "date", Value: -1}})).Decode(&day)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return domain.OverallDay{}, ErrNotFound
	}
	return day, err
}

// Delete removes one day's document.
func (s *OverallStore) Delete(ctx context.Context, userId primitive.ObjectID, date time.Time) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	_, err := s.col.DeleteOne(ctx, overallFilter(userId, date))
	return err
}

// DeleteByUser removes every document of a permanently deleted user.
func (s *OverallStore) DeleteByUser(ctx context.Context, userId primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	_, err := s.col.DeleteMany(ctx, bson.M{"user_id": userId})
	return err
}
