
import supabase from "../config/supabase.js";

// Submit a new blog comment
export async function submitComment(req, res) {
    try {
        const {
            blog_slug,
            author_name,
            author_email,
            comment,
            form_botcheck
        } = req.body;

        // Honeypot spam protection
        if (form_botcheck) {
            return res.status(400).json({
                success: false,
                message: "Invalid submission"
            });
        }

        // Validate required fields
        if (!blog_slug || !author_name || !author_email || !comment) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        // Validate input types and lengths
        if (
            typeof blog_slug !== "string" ||
            typeof author_name !== "string" ||
            typeof author_email !== "string" ||
            typeof comment !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid input"
            });
        }

        const cleanSlug = blog_slug.trim();
        const cleanName = author_name.trim();
        const cleanEmail = author_email.trim().toLowerCase();
        const cleanComment = comment.trim();

        if (
            cleanSlug.length > 150 ||
            cleanName.length < 2 ||
            cleanName.length > 100 ||
            cleanEmail.length > 254 ||
            cleanComment.length < 3 ||
            cleanComment.length > 3000
        ) {
            return res.status(400).json({
                success: false,
                message: "Please check your input lengths"
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(cleanEmail)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address"
            });
        }

        // Save comment to Supabase
        const { data, error } = await supabase
            .from("blog_comments")
            .insert([
                {
                    blog_slug: cleanSlug,
                    author_name: cleanName,
                    author_email: cleanEmail,
                    comment: cleanComment,
                    status: "pending"
                }
            ])
            .select("id, author_name, comment, status, created_at")
            .single();

        if (error) throw error;

        return res.status(201).json({
            success: true,
            message: "Your comment has been submitted and is awaiting approval.",
            comment: data
        });

    } catch (error) {
        console.error("Submit Comment Error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to submit your comment. Please try again."
        });
    }
}


// Retrieve approved comments for a specific blog post
export async function getBlogComments(req, res) {
    try {
        const { slug } = req.params;

        if (
            !slug ||
            typeof slug !== "string" ||
            slug.length > 150 ||
            !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid blog identifier"
            });
        }

        const { data, error } = await supabase
            .from("blog_comments")
            .select("id, author_name, comment, created_at")
            .eq("blog_slug", slug)
            .eq("status", "approved")
            .order("created_at", { ascending: false });

        if (error) throw error;

        return res.status(200).json({
            success: true,
            total: data.length,
            comments: data
        });

    } catch (error) {
        console.error("Get Blog Comments Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve comments"
        });
    }
}
