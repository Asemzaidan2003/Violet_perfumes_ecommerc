// controllers/cartController.js
import Cart from "../models/cartModel.js";
import Product from "../models/productModel.js";

export const addToCart = async (req, res) => {
  try {
    const { product_id, product_size, product_quantity } = req.body;

    const product = await Product.findById(product_id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    // نجيب السعر من حجم المنتج المختار
    const selectedSize = product.size_list.find(
      (size) => size.size === product_size
    );
    if (!selectedSize)
      return res.status(400).json({ message: "Size not available" });

    const price = selectedSize.price;
    const total_price = price * product_quantity;

    let cart = await Cart.findOne(); // لو بدك تربطه بمستخدم، أضف شرط user_id

    if (!cart) {
      cart = new Cart({
        products: [],
        total_items: 0,
        total_price: 0,
      });
    }

    // check if same product with same size already exists
    const existingIndex = cart.products.findIndex(
      (p) =>
        p.product_id.toString() === product_id &&
        p.product_size === product_size
    );

    if (existingIndex > -1) {
      // عدل الكمية
      cart.products[existingIndex].product_quantity += product_quantity;
      cart.products[existingIndex].total_price += total_price;
    } else {
      cart.products.push({
        product_id,
        product_size,
        product_price: price,
        product_quantity,
        total_price,
      });
    }

    // تحديث المجاميع
    cart.total_items = cart.products.reduce(
      (acc, item) => acc + item.product_quantity,
      0
    );
    cart.total_price = cart.products.reduce(
      (acc, item) => acc + item.total_price,
      0
    );

    await cart.save();
    res.status(200).json(cart);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};
