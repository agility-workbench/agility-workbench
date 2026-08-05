export type Trade = {
  id: string;
  name: string;
  city: string;
  price: number;
  qty: number;
  notes: string;
};

const NAMES = ["Widget", "Gadget", "Gizmo", "Doohickey", "Contraption", "Apparatus", "Device", "Instrument"];
const CITIES = ["New York", "Chicago", "San Francisco", "Seattle", "Austin", "Miami", "Denver", "Boston"];

export function makeTrades(count: number): Trade[] {
  const rows: Trade[] = [];
  for (let i = 0; i < count; i++) {
    const name = NAMES[i % NAMES.length];
    const city = CITIES[(i * 3) % CITIES.length];
    rows.push({
      id: String(i + 1),
      name: `${name} ${Math.floor(i / NAMES.length) + 1}`,
      city,
      price: Math.round((10 + ((i * 37) % 490) + (i % 100) / 100) * 100) / 100,
      qty: 1 + ((i * 13) % 50),
      notes: `${name} traded out of ${city}`,
    });
  }
  return rows;
}
