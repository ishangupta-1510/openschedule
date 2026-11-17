import { Calendar, dayStart, addDays, dateKey, parts } from "/dist/index.js";
const $ = (s) => document.querySelector(s),
  key = "openschedule-demo-v1";
const base = dayStart(Date.now(), "local");
const monday = addDays(base, -((new Date(base).getDay() + 6) % 7), "local");
function at(day, hour) {
  const d = new Date(addDays(monday, day, "local"));
  d.setHours(hour, 0, 0, 0);
  return +d;
}
const resources = [
  { id: "maya", title: "Maya Chen", group: "Design", color: "#087f73" },
  { id: "alex", title: "Alex Morgan", group: "Design", color: "#087f73" },
  { id: "jordan", title: "Jordan Lee", group: "Engineering", color: "#b78732" },
  { id: "sam", title: "Sam Rivera", group: "Engineering", color: "#b78732" },
  {
    id: "studio",
    title: "Studio A",
    group: "Spaces",
    color: "#8869a5",
    capacity: 1,
  },
  {
    id: "room",
    title: "The Green Room",
    group: "Spaces",
    color: "#8869a5",
    capacity: 1,
  },
];
const events = [
  ["e1", "Brand exploration", 0, 9, 16, "maya"],
  ["e2", "Website concepts", 2, 9, 17, "maya"],
  ["e3", "Design review", 4, 10, 15, "maya"],
  ["e4", "Research synthesis", 0, 10, 17, "alex"],
  ["e5", "Prototype sprint", 1, 9, 18, "alex"],
  ["e6", "User interviews", 3, 10, 16, "alex"],
  ["e7", "Platform architecture", 0, 9, 18, "jordan"],
  ["e8", "API integration", 2, 9, 18, "jordan"],
  ["e9", "Release preparation", 4, 9, 17, "jordan"],
  ["e10", "Component library", 1, 9, 17, "sam"],
  ["e11", "Performance lab", 3, 9, 18, "sam"],
  ["e12", "Product photography", 1, 10, 17, "studio"],
  ["e13", "Campaign shoot", 3, 9, 17, "studio"],
  ["e14", "Team planning", 0, 9, 12, "room"],
  ["e15", "Client workshop", 2, 10, 16, "room"],
  ["e16", "Friday reflections", 4, 14, 17, "room"],
].map(([id, title, day, start, end, resource]) => ({
  id,
  title,
  start: at(day, start),
  end: at(day, end),
  resourceIds: [resource],
}));
for (const r of resources) {
  r.workingDays = [1, 2, 3, 4, 5];
  r.requiredCoverage = r.id === "studio" ? 2 : 1;
  r.timeZone = "local";
}
resources.find((r) => r.id === "studio").holidays = [
  { date: dateKey(at(2, 0), "local"), name: "Branch holiday" },
];
events.push({
  id: "leave-1",
  title: "Annual leave",
  kind: "leave",
  allDay: true,
  start: at(3, 0),
  end: at(5, 0),
  resourceIds: ["maya"],
  color: "#8869a5",
});
let saved;
try {
  saved = JSON.parse(localStorage.getItem(key));
} catch {}
let active;
function changed() {
  $("#event-count").textContent = calendar.store.events.length;
  $("#resource-count").textContent = calendar.store.resources.length;
  try {
    localStorage.setItem(key, JSON.stringify(calendar.store.snapshot()));
  } catch {
    $("#notice").textContent =
      "Browser storage is unavailable. Export to save your changes.";
  }
}
const calendar = new Calendar($("#calendar"), {
  date: Date.now(),
  view: "timelineWeek",
  resources,
  events,
  height: 570,
  slotWidth: 148,
  rowHeight: 76,
  dayStart: 8,
  dayEnd: 19,
  groupResources: true,
  showUtilisation: true,
  onEventClick: (e) => openEditor(e),
  onSelect: (s) => openEditor(s),
  onChange: () => changed(),
  onError: (e) => {
    $("#notice").textContent = e.message;
  },
});
if (saved) {
  try {
    calendar.store.restore(saved);
  } catch {
    $("#notice").textContent =
      "Saved data could not be restored. The sample schedule is shown.";
  }
}
changed();
window.calendar = calendar;
const inputDate = (n, zone = "local") => {
  const p = parts(n, zone);
  return `${dateKey(n, zone)}T${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
};
function openEditor(value = {}) {
  active = value.occurrenceId ? value : undefined;
  const form = $("#event-form");
  form.reset();
  $("#form-error").textContent = "";
  $("#editor-title").textContent = active ? "Edit occurrence" : "New event";
  form.elements.title.value = value.title ?? "";
  form.elements.start.value = inputDate(
    value.start ?? Date.now(),
    value.timeZone ?? "local",
  );
  form.elements.end.value = inputDate(
    value.end ?? Date.now() + 3600000,
    value.timeZone ?? "local",
  );
  form.elements.allDay.checked = value.allDay ?? false;
  form.elements.color.value = value.color ?? "#087f73";
  form.elements.kind.value = value.kind ?? "shift";
  form.elements.timeZone.value = value.timeZone ?? "local";
  form.elements.repeat.disabled = !!active;
  form.elements.repeat.value = active?.recurrence?.frequency ?? "none";
  const resourceSelect = form.elements.resourceIds;
  resourceSelect.replaceChildren();
  for (const r of calendar.store.resources) {
    const option = document.createElement("option");
    option.value = r.id;
    option.textContent = `${r.title} · ${r.group ?? "Resource"}`;
    option.selected = (value.resourceIds ?? [value.resourceId]).includes(r.id);
    resourceSelect.append(option);
  }
  $("#delete-event").hidden = !active;
  $("#editor").showModal();
}
$("#new-event").onclick = () => openEditor();
$("#close").onclick = () => $("#editor").close();
$("#event-form").onsubmit = (e) => {
  e.preventDefault();
  const f = e.currentTarget.elements;
  try {
    const input = {
      kind: f.kind.value,
      timeZone: f.timeZone.value,
      title: f.title.value.trim(),
      start: f.start.value,
      end: f.end.value,
      allDay: f.allDay.checked,
      resourceIds: [...f.resourceIds.selectedOptions].map((o) => o.value),
      color: f.color.value,
    };
    if (!input.title) throw new Error("Enter an event title");
    if (active) calendar.store.changeOccurrence(active, input);
    else
      calendar.store.addEvent({
        ...input,
        id: crypto.randomUUID(),
        ...(f.repeat.value === "none"
          ? {}
          : {
              recurrence: {
                frequency: f.repeat.value,
                count: f.repeat.value === "daily" ? 30 : 12,
              },
            }),
      });
    $("#editor").close();
  } catch (err) {
    $("#form-error").textContent = err.message;
  }
};
$("#delete-event").onclick = () => {
  if (active) {
    calendar.store.removeEvent(active.seriesId);
    $("#editor").close();
  }
};
$("#search").oninput = (e) => calendar.setFilter(e.target.value);
$("#print").onclick = () => calendar.print();
$("#export").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(calendar.store.snapshot(), null, 2)], {
      type: "application/json",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "openschedule.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("#import").onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (file) calendar.store.restore(JSON.parse(await file.text()));
  } catch (err) {
    $("#notice").textContent = err.message;
  }
  e.target.value = "";
};
function renderResources() {
  const list = $("#resource-list");
  list.replaceChildren();
  for (const r of calendar.store.resources) {
    const row = document.createElement("div");
    row.className = "resource-item";
    const name = document.createElement("span");
    name.textContent = r.title;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "Remove";
    remove.onclick = () => {
      try {
        calendar.store.removeResource(r.id);
        renderResources();
      } catch (err) {
        $("#resource-error").textContent = err.message;
      }
    };
    row.append(name, remove);
    list.append(row);
  }
}
$("#resources").onclick = () => {
  renderResources();
  $("#resource-error").textContent = "";
  $("#resource-editor").showModal();
};
$("#close-resources").onclick = () => $("#resource-editor").close();
$("#resource-form").onsubmit = (e) => {
  e.preventDefault();
  try {
    const f = e.currentTarget.elements;
    calendar.store.addResource({
      id: crypto.randomUUID(),
      title: f.title.value.trim(),
      group: f.group.value.trim(),
    });
    e.currentTarget.reset();
    renderResources();
  } catch (err) {
    $("#resource-error").textContent = err.message;
  }
};

const copyButton = document.createElement("button");
copyButton.className = "os-button";
copyButton.textContent = "Copy last week";
copyButton.onclick = () => {
  try {
    const target = calendar.currentRange.start;
    const copied = calendar.store.copyWeek(
      addDays(target, -7, calendar.store.zone),
      target,
    );
    $("#notice").textContent = copied.length
      ? `Copied ${copied.length} shifts. Undo is available.`
      : "No shifts were found in the previous week.";
  } catch (error) {
    $("#notice").textContent = error.message;
  }
};
$(".calendar-tools").insertBefore(copyButton, $("#search"));
