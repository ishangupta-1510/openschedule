import type {
  Rules,
  DateInput,
  View,
  Resource,
  EventInput,
  Feed,
  Occurrence,
  Selection,
  Change,
  Range,
} from "./types.js";
export interface CalendarOptions extends Rules {
  date?: DateInput;
  view?: View;
  locale?: string;
  firstDay?: number;
  resources?: Resource[];
  events?: EventInput[];
  eventSource?: Feed<EventInput>;
  resourceSource?: Feed<Resource>;
  editable?: boolean;
  selectable?: boolean;
  slotMinutes?: number;
  snapMinutes?: number;
  dayStart?: number;
  dayEnd?: number;
  rowHeight?: number;
  slotWidth?: number;
  height?: number;
  resourceWidth?: number;
  resourceColumns?: { field: string; label: string }[];
  groupResources?: boolean;
  filterResourcesWithEvents?: boolean;
  resourceOrder?: (a: Resource, b: Resource) => number;
  virtualize?: boolean;
  nowIndicator?: boolean;
  direction?: "ltr" | "rtl";
  showCellStatus?: boolean;
  showUtilisation?: boolean;
  eventContent?: (event: Occurrence) => string | Node;
  resourceContent?: (resource: Resource) => string | Node;
  onEventClick?: (event: Occurrence) => void;
  onSelect?: (selection: Selection) => void;
  onChange?: (change: Change) => void;
  onDatesChange?: (range: Range & { view: View }) => void;
  onError?: (error: Error) => void;
  onLoading?: (loading: boolean) => void;
}
