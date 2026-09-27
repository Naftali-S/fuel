import {
  getMostRecentQuantitySample,
  isHealthDataAvailable,
  queryStatisticsForQuantity,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';

export type HealthProbeResult =
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | {
      status: 'ok';
      latestWeightKg: number | null;
      latestWeightDate: string | null;
      stepsToday: number | null;
    };

/**
 * Phase 0 check: can this build (signed with a free Apple ID) talk to HealthKit?
 * A missing entitlement surfaces as an error from requestAuthorization.
 * iOS hides read-permission denials, so "no data" can also mean "denied".
 */
export async function runHealthProbe(): Promise<HealthProbeResult> {
  if (!isHealthDataAvailable()) return { status: 'unavailable' };

  try {
    await requestAuthorization({
      toRead: ['HKQuantityTypeIdentifierBodyMass', 'HKQuantityTypeIdentifierStepCount'],
    });

    const weight = await getMostRecentQuantitySample('HKQuantityTypeIdentifierBodyMass', 'kg');

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const steps = await queryStatisticsForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], {
      filter: { date: { startDate: startOfDay } },
      unit: 'count',
    });

    return {
      status: 'ok',
      latestWeightKg: weight?.quantity ?? null,
      latestWeightDate: weight ? new Date(weight.startDate).toISOString() : null,
      stepsToday: steps.sumQuantity?.quantity ?? null,
    };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}
