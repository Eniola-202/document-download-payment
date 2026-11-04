import supabase from "../config/supabase.js";



export async function getProducts(req, res) {
  try {
    const { data, error } = await supabase
      .from("products")
      .select(`id, name, slug, description, price_kobo, currency, created_at`)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) {
      throw error;
    }
    res.status(200).json({
      success: true,
      count: data.length,
      products: data,
    });
  } catch (error) {
    console.error("Get product error", error.message);

    res.status(500).json({
      success: false,
      message: "unable to retrieve products",
    });
  }
}

export async function getProductSlug(req, res) {
  try {
    const { slug } = req.params;

    const { data, error } = await supabase
      .from("products")
      .select(`id, name, slug, description, price_kobo, currency, created_at`)
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        message: "product not found",
      });
    }
    res.status(200).json({
      success: true,
      product: data,
    });
  } catch (error) {
    console.error("Get product error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve products",
    });
  }
}
