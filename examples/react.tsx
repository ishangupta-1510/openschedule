import { useCallback, useSyncExternalStore } from "react";
import {
  ScheduleStore,
  packIntervals,
  type Range,
} from "openschedule-calendar/core";

// The engine has no React dependency. Supply your own design-system components.
export function useSchedule(store: ScheduleStore) {
  const subscribe = useCallback(
    (notify: () => void) => store.subscribe(notify),
    [store],
  );
  const getSnapshot = useCallback(() => store.getSnapshot(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function RosterSummary({
  store,
  range,
}: {
  store: ScheduleStore;
  range: Range;
}) {
  const snapshot = useSchedule(store);
  const occurrences = store.occurrences(range);
  const utilisation = store.utilisation(range);
  return (
    <table aria-label="Weekly roster summary">
      <thead>
        <tr>
          <th>Person</th>
          <th>Hours</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {snapshot.resources.map((resource) => {
          const status = store.cellStatus(resource.id, range);
          const hours = utilisation.find(
            (row) => row.resourceId === resource.id,
          )!;
          // A custom timeline can use these original, framework-neutral placements.
          const placements = packIntervals(
            occurrences.filter((e) => e.resourceIds.includes(resource.id)),
          );
          return (
            <tr key={resource.id} data-event-count={placements.length}>
              <th scope="row">{resource.title}</th>
              <td>{hours.scheduledHours.toFixed(1)}</td>
              <td>{status.label}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
