import Product from "../models/product.model.js";
import { invalidateCatalog } from "../store/catalog.js";

// Present and finite: rejects missing, null, "" and NaN but lets 0 through (negatives are left to the model's min).
export const isNum = (v) => v !== null && v !== undefined && v !== "" && typeof v !== "boolean" && Number.isFinite(Number(v));

// POST Product
export const createProduct = async (req, res) => {
    const {
        p_name,
        p_image,
        size_list,
        p_category,
        oil_id,
        status,
        visible,
        p_offer_percentage,
        oil_percentage,
        alcohol_percentage,
        description,
        families,
        notes,
        images,
        keywords,
        brand,
        offer_ends_at,
    } = req.body;

    // Validate required fields (p_offer_percentage and status are optional)
    if (!p_name || !p_image || !size_list || !p_category || !oil_id || !isNum(oil_percentage) || !isNum(alcohol_percentage)) {
        return res.status(400).json({ success: false, message: "يرجى تعبئة جميع الحقول المطلوبة" });
    }

    // Validate `size_list` structure (should be an array of objects with size & price)
    if (!Array.isArray(size_list) || size_list.some(item => !item?.size || !isNum(item.price))) {
        return res.status(400).json({ success: false, message: "صيغة الأحجام غير صحيحة — لكل حجم مقاس وسعر" });
    }
    // A thing to do , don't forget to check if the oil_id is found , then save the data , otherwise it's an error !!


    // Create a new product
    const newProduct = new Product({
        p_name,
        p_image,
        size_list,
        p_category,
        oil_id,
        oil_percentage,
        alcohol_percentage,
        status,
        visible,
        p_offer_percentage: p_offer_percentage || 0,
        description,
        families,
        notes,
        images,
        keywords,
        brand,
        offer_ends_at,
    });

    await newProduct.save();
    invalidateCatalog();
    res.status(201).json({ success: true, message: "Product created successfully", data: newProduct });
};

//DELETE
export const deleteProduct = async (req, res) => {
    const { id } = req.params;

    const deletedProduct = await Product.findByIdAndDelete(id);
    if (!deletedProduct) {
        return res.status(404).json({
            success: false,
            message: `No product found with this ID: ${id}`,
        });
    }
    invalidateCatalog();
    res.status(200).json({
        success: true,
        message: "Product deleted",
    })
};

// GET all products
export const getProducts = async (req, res) => {
    const products = await Product.find({}).populate("brand", "name_ar");
    if (products.length === 0) {
        return res.status(404).json({
            success: false,
            message: "No products found",
        });
    }

    res.status(200).json({
        success: true,
        message: "Products fetched successfully",
        data: products,
    });
};

// GET product by ID
export const getProductById = async (req, res) => {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
        return res.status(404).json({
            success: false,
            message: `No product found with ID: ${id}`,
        });
    }

    res.status(200).json({
        success: true,
        message: "Product fetched successfully",
        data: product,
    });
};

//PUT

export const updateProduct = async (req, res) => {
    const { id } = req.params;

    const update = req.body;

    const updatedProduct = await Product.findByIdAndUpdate(id, update, { new: true });

    if (!updatedProduct) {
        return res.status(404).json({
            success: false,
            message: `No product found with this ID: ${id}`,
        });
    }

    invalidateCatalog();
    res.status(200).json({
        success: true,
        message: "Product updated successfully",
        data: updatedProduct,
    });
};
