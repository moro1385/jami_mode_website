// Synthetic data only. Auth IDs come from this test project's Admin API.
export const authFixtures = [
 { name: 'Buyer One', phone: '+12025550101' },
 { name: 'Buyer Two', phone: '+12025550102' },
 { name: 'Test Admin', phone: '+12025550103' },
];
export function checkoutFixtures(users) {
  const id = suffix => `40000000-0000-0000-0000-${String(suffix).padStart(12, '0')}`;
  const category = { id: id(100), name: 'Synthetic checkout', slug: 'synthetic-checkout' };
  const product = (suffix, name, extra = {}) => ({ id: id(suffix), name, slug: `synthetic-${suffix}`,
    category_id: category.id, price: 10000, is_active: true, is_out_of_stock: false,
    is_new: true, is_featured: true, sizes: ['M'], colors: ['red'], tags: ['synthetic'],
    brand: ['Test'], type: ['shirt'], images: ['/placeholder.svg'], ...extra });
  return {
    categories: [category],
    profiles: users.map((user, i) => ({ id: user.id, first_name: authFixtures[i].name, wallet_balance: 0 })),
    user_roles: [{ user_id: users[2].id, role: 'admin' }],
    addresses: users.slice(0, 2).map((user, i) => ({ id: id(200 + i), user_id: user.id,
      label: 'Synthetic address', recipient: authFixtures[i].name, phone: authFixtures[i].phone,
      country: 'Iran', city: 'Tehran', line1: `Synthetic test street ${i + 1}`,
      postal_code: '1111111111', is_default: true })),
    products: [product(1, 'Product without variants'), product(2, 'Variant shirt'),
      product(3, 'Inactive', { is_active: false }), product(4, 'Unavailable', { is_out_of_stock: true }),
      product(5, 'No stock variant'), product(6, 'Invalid fractional price', { price: 10000.50 })],
    product_variants: [
      { id: id(301), product_id: id(2), size: 'M', color: 'red', sku: 'SYNTHETIC-M-RED', price: 20000, stock_quantity: 2 },
      { id: id(302), product_id: id(5), size: 'M', color: 'red', sku: 'SYNTHETIC-EMPTY', price: 20000, stock_quantity: 0 },
    ],
  };
}
