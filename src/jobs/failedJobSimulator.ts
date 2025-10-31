import type { EventName, HasuraEventPayload, JobOptions } from "../types";

export const failedJobSimulator = async (
  event: EventName, 
  hasuraEvent: HasuraEventPayload, 
  options?: JobOptions
): Promise<never> => {
  const message = options?.message || 'FailedJob';
  const delay = options?.delay || 0;
  
  console.log(`[failedJobSimulator] ${message} delaying ${delay} ms...`);
  await delayAsync(delay);
  throw new Error('failedJobSimulator failed!');
};

function delayAsync(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

