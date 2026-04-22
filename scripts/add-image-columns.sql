-- Add columns for image generation system to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS images_generated_month INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pending_image_payment BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS extra_images_purchased INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS image_payment_amount NUMERIC(10,2) DEFAULT 0;
