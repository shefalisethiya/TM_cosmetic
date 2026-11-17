CREATE DATABASE IF NOT EXISTS tm_cosmetic;
USE tm_cosmetic;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(20) NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  mrp DECIMAL(10,2) NULL,
  image_url VARCHAR(500),
  stock_quantity INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id)
);

INSERT IGNORE INTO categories (name) VALUES
('Skin Care'), ('Makeup'), ('Hair Care'), ('Fragrance'), ('Bath & Body');

INSERT INTO products (category_id, name, description, price, mrp, image_url, stock_quantity)
SELECT c.id, 'Radiance Vitamin C Serum', 'A lightweight everyday serum for a fresh-looking glow.', 699, 899,
'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=800&q=85', 25
FROM categories c WHERE c.name='Skin Care'
AND NOT EXISTS (SELECT 1 FROM products WHERE name='Radiance Vitamin C Serum');

INSERT INTO products (category_id, name, description, price, mrp, image_url, stock_quantity)
SELECT c.id, 'Velvet Matte Lip Colour', 'A comfortable matte lip colour for everyday looks.', 499, 599,
'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=800&q=85', 30
FROM categories c WHERE c.name='Makeup'
AND NOT EXISTS (SELECT 1 FROM products WHERE name='Velvet Matte Lip Colour');

INSERT INTO products (category_id, name, description, price, mrp, image_url, stock_quantity)
SELECT c.id, 'Hydra Glow Moisturizer', 'A daily moisturizer for soft, hydrated-feeling skin.', 549, 699,
'https://images.unsplash.com/photo-1556229010-6c3f2c9ca5f8?auto=format&fit=crop&w=800&q=85', 20
FROM categories c WHERE c.name='Skin Care'
AND NOT EXISTS (SELECT 1 FROM products WHERE name='Hydra Glow Moisturizer');
