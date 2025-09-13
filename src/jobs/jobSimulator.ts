import type { EventName, HasuraEventPayload, JobOptions } from "../types";

export const jobSimulator = async (
  event: EventName, 
  hasuraEvent: HasuraEventPayload, 
  options?: JobOptions
): Promise<string> => {
  const message = options?.message || 'Job';
  const delay = options?.delay || 0;
  
  console.log(`[jobSimulator] ${message} delaying ${delay} ms...`);
  await delayAsync(delay);
  console.log(`[jobSimulator] ${message} complete!`);
  return message + ' complete!';
};

function delayAsync(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
