# How Fuel calculates

All calculation code lives in `src/engine/`. It is plain TypeScript with no app
or network dependencies, and every part is unit-tested (`npm test`). The methods
come from published nutrition and exercise science, cited below.

## Trend weight (`trend.ts`)

Daily scale weight swings by a kilogram or more with water, salt and gut content.
The trend is a time-aware exponential moving average:

    trend += (1 − e^(−Δd/τ)) · (weight − trend),   τ = 10 days

Δd is the number of days since the previous weigh-in, so gaps are handled
properly. A single implausible entry (a typo) can move the trend only a little.

## Energy expenditure (`expenditure.ts`)

A two-state Kalman filter tracks true body mass *W* and daily expenditure *E*:

- each day, *W* changes by (logged intake − *E*) / 7700 kcal per kg;
- *E* drifts slowly, and by about 15 kcal/day per kg of mass change;
- each weigh-in is a noisy measurement of *W*.

It starts from an equation-based estimate (Mifflin-St Jeor, or Katch-McArdle when
body fat is known, times an activity factor). As logged days accumulate, the data
takes over. Unlogged days make the estimate less certain instead of being guessed.

*E* is in **logged** calories. If you always log a little less than you eat, the
estimate absorbs that, and targets stay achievable as you log.

Guardrails:
- the published value moves at most 60 kcal/day;
- it holds steady while more than 3 of the last 7 days are unlogged.

## Training and steps (`modifiers.ts`)

- **Lifting (Hevy):** net session energy uses METs from the Compendium of Physical
  Activities (3.5–6 METs). The MET value is scaled by set density relative to your
  own median.
- **Steps:** about 0.0005 kcal per kg of body weight per step.

The filter already learns the average cost of your routine. Only the difference
between your last 7 days and your 28-day baseline is added, at half weight, so a
harder week shows up early and nothing is counted twice.

## Targets (`targets.ts`)

- **Calories:** expenditure plus the energy needed for your planned rate
  (% of body weight per week, 7700 kcal per kg).
  - The target allows for the thermic effect of food (about 10% of intake), which
    falls when you eat less.
  - Limits:
    - loss at most 1%/week and gain at most 0.5%/week;
    - never below BMR (or 1200 kcal);
    - at most ±200 kcal change per weekly check-in (you can override this).
- **Macros:**
  - protein 2.0 g/kg by default;
  - fat at least 0.7 g/kg and at least 20% of calories (25% by default);
  - carbohydrate makes up the rest.
  - Carbs can optionally shift toward training days, keeping the weekly total.

## Strength (`strength.ts`)

Estimated one-rep max uses Epley, w × (1 + reps/30), with reps in reserve from RPE.
Only sets of 1–12 reps are used. Fuel compares the last two weeks against three
weeks earlier:
- falling strength on a cut → suggests slowing down or a diet break;
- fast gain without strength progress → suggests a smaller surplus.

## Validation

`src/engine/sim/` contains a synthetic person with a known true expenditure. Their
scale readings vary by ±1 kg, their logs are noisy or biased, and some days are
missing.
- The expenditure estimate is within 5% on average by week 3 (worst case 10% by
  week 4 and 5% by week 8).
- In closed-loop tests, where the person eats what the weekly check-in prescribes,
  they lose, maintain or gain at the planned rate, including with 15% of days
  missed and 10% under-logging.

## References

- Mifflin MD, St Jeor ST, et al. *Am J Clin Nutr.* 1990;51(2):241–247.
- Katch-McArdle lean-mass BMR equation (370 + 21.6 × lean mass).
- Hall KD, et al. Quantification of the effect of energy imbalance on bodyweight.
  *Lancet.* 2011;378(9793):826–837.
- Herrmann SD, et al. 2024 Adult Compendium of Physical Activities.
  *J Sport Health Sci.* 2024;13(1):6–12.
- Epley B. *Poundage Chart.* Boyd Epley Workout, 1985.
- Kalman RE. A new approach to linear filtering and prediction problems.
  *J Basic Eng.* 1960;82(1):35–45.

This is not medical advice.
