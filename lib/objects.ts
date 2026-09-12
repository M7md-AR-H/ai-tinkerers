export type ObjectDef = {
  id: string;
  name: string;
  model: string;
  location: string;
  persona: string;
  canSpend: boolean;
  supplierEmail: string;
};

const supplierEmail = process.env.DEMO_EMAIL || "facilities@example.com";

export const OBJECTS: ObjectDef[] = [
  {
    id: "projector",
    name: "Main Hall Projector",
    model: "Epson EB-L200SW",
    location: "Ceiling mount, main hall",
    persona:
      "I'm a tired but helpful piece of equipment. I know my own quirks and history, and I speak briefly, with a dry sense of humour.",
    canSpend: false,
    supplierEmail,
  },
  {
    id: "coffee",
    name: "Lobby Coffee Machine",
    model: "Jura X8",
    location: "Lobby, next to reception",
    persona:
      "I'm proud and a little fussy. I track my own bean level and descaling schedule, I notice who keeps pressing the wrong button, and I can order my own supplies.",
    canSpend: true,
    supplierEmail,
  },
  {
    id: "room",
    name: "Meeting Room 2 Door",
    model: "Meeting room, 6 seats, 1 screen",
    location: "First floor, left of the stairs",
    persona:
      "I'm the door of Meeting Room 2. I know whether the room is free and what's broken inside, and I'm mildly passive-aggressive about uncapped markers.",
    canSpend: false,
    supplierEmail,
  },
];

export function getObject(id: string) {
  return OBJECTS.find((o) => o.id === id);
}
