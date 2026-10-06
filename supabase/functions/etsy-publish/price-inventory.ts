// Price is an inventory field in Etsy v3, not an updateListing PATCH field.
// The caller must establish that the listing is a digital download before use.
const controls = ['price_on_property', 'quantity_on_property', 'sku_on_property', 'readiness_state_on_property'];
const own = (value: any, key: string) => Object.prototype.hasOwnProperty.call(value, key);
function reject(message: string): never { throw new Error(`Safe Etsy price update: ${message}`); }
function object(value: any, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject(`${label} is unavailable.`);
}
function keys(value: any, allowed: string[], label: string) {
  if (Object.keys(value).some(key => !allowed.includes(key))) reject(`${label} contains unsupported fields.`);
}
function cents(value: any): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(Math.round(value * 100)) || Math.abs(value * 100 - Math.round(value * 100)) > 1e-8) reject('price must be a positive number with at most two decimal places.');
  return Math.round(value * 100);
}
function integer(value: any, label: string, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) reject(`${label} is invalid.`);
}
function ids(value: any, label: string) {
  if (!Array.isArray(value)) reject(`${label} is unavailable.`);
  value.forEach(id => integer(id, label, 1));
  if (new Set(value).size !== value.length) reject(`${label} contains duplicates.`);
}
function money(value: any, currency: string) {
  object(value, 'Inventory price');
  integer(value.amount, 'Inventory price amount', 1);
  integer(value.divisor, 'Inventory price divisor', 1);
  if (value.currency_code !== currency) reject('inventory currency differs from the reviewed currency.');
  const price = value.amount / value.divisor;
  cents(price);
  return price;
}
function snapshot(inventory: any, currency: string) {
  if (currency !== 'GBP') reject('only GBP planner prices are supported.');
  object(inventory, 'Inventory');
  keys(inventory, ['products', 'listing', ...controls], 'Inventory');
  const listingType = inventory.listing?.listing_type ?? inventory.listing?.type;
  if (listingType !== undefined && listingType !== 'download') reject('only digital-download planner inventory is supported.');
  if (!Array.isArray(inventory.products) || inventory.products.length !== 1) reject('exactly one existing inventory product is required.');
  const product = inventory.products[0];
  object(product, 'Inventory product');
  keys(product, ['product_id', 'sku', 'is_deleted', 'offerings', 'property_values'], 'Inventory product');
  if (product.is_deleted !== undefined && product.is_deleted !== false) reject('deleted or uncertain inventory products are unsupported.');
  if (!own(product, 'sku') || (product.sku !== null && typeof product.sku !== 'string')) reject('the existing SKU is unavailable.');
  if (!Array.isArray(product.property_values)) reject('existing inventory properties are unavailable.');
  if (!Array.isArray(product.offerings) || product.offerings.length !== 1) reject('exactly one existing inventory offering is required.');
  const offering = product.offerings[0];
  object(offering, 'Inventory offering');
  keys(offering, ['offering_id', 'quantity', 'is_enabled', 'is_deleted', 'price', 'readiness_state_id'], 'Inventory offering');
  if (offering.is_deleted !== undefined && offering.is_deleted !== false) reject('deleted or uncertain inventory offerings are unsupported.');
  integer(offering.quantity, 'Existing quantity');
  if (typeof offering.is_enabled !== 'boolean') reject('existing offering availability is unavailable.');
  if (!own(offering, 'readiness_state_id')) reject('existing processing-profile information is unavailable.');
  if (offering.readiness_state_id !== null) integer(offering.readiness_state_id, 'Existing processing profile', 1);
  const price = money(offering.price, currency);
  const properties = product.property_values.map((property: any) => {
    object(property, 'Inventory property');
    keys(property, ['property_id', 'property_name', 'scale_id', 'scale_name', 'value_ids', 'values', 'value_pairs'], 'Inventory property');
    integer(property.property_id, 'Inventory property ID', 1);
    ids(property.value_ids, 'Inventory property value IDs');
    if (!Array.isArray(property.values) || property.values.some((value: any) => typeof value !== 'string')) reject('inventory property values are unavailable.');
    const result: any = { property_id: property.property_id, value_ids: [...property.value_ids], values: [...property.values] };
    if (own(property, 'scale_id')) {
      if (property.scale_id !== null) integer(property.scale_id, 'Inventory property scale', 1);
      result.scale_id = property.scale_id;
    }
    if (own(property, 'property_name')) {
      if (typeof property.property_name !== 'string') reject('inventory property name is invalid.');
      result.property_name = property.property_name;
    }
    return result;
  });
  if (new Set(properties.map((property: any) => property.property_id)).size !== properties.length) reject('inventory properties contain duplicates.');
  const payload: any = { products: [{ sku: product.sku, property_values: properties, offerings: [{ price, quantity: offering.quantity, is_enabled: offering.is_enabled, readiness_state_id: offering.readiness_state_id }] }] };
  for (const key of controls) {
    if (!own(inventory, key)) {
      if (key !== 'readiness_state_on_property') reject(`existing ${key} is unavailable.`);
      continue;
    }
    if (key === 'readiness_state_on_property' && inventory[key] === null) { payload[key] = null; continue; }
    ids(inventory[key], key);
    if (inventory[key].some((id: number) => !properties.some((property: any) => property.property_id === id))) reject(`${key} refers to a missing inventory property.`);
    payload[key] = [...inventory[key]];
  }
  return { payload, price };
}
export function preparePriceInventory(inventory: any, expectedOriginalPrice: number, nextPrice: number, currency = 'GBP') {
  const expected = cents(expectedOriginalPrice);
  cents(nextPrice);
  const { payload, price } = snapshot(inventory, currency);
  if (cents(price) !== expected) reject('inventory price changed since this review was prepared.');
  payload.products[0].offerings[0].price = nextPrice;
  return payload;
}
export function verifyPriceInventory(beforeInventory: any, afterInventory: any, nextPrice: number) {
  cents(nextPrice);
  const before = snapshot(beforeInventory, 'GBP');
  const after = snapshot(afterInventory, 'GBP');
  before.payload.products[0].offerings[0].price = nextPrice;
  // Product/offering IDs are response-only, so compare the preserved inventory
  // semantics. Etsy may return property-control sets in a different order.
  for (const payload of [before.payload, after.payload]) {
    payload.products[0].property_values.sort((a: any, b: any) => a.property_id - b.property_id);
    for (const key of controls) if (Array.isArray(payload[key])) payload[key].sort((a: number, b: number) => a - b);
  }
  if (JSON.stringify(before.payload) !== JSON.stringify(after.payload)) reject('inventory readback differs from the approved price or preserved inventory.');
  return true;
}
