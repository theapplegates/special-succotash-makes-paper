# Cloudinary JXL Picture Workflow for Astro Posts

This workflow bypasses Astro/Sharp for post images.

Cloudinary creates and serves the image formats. Astro only renders the generated
HTML inside the MDX blog post.

## What The Pipeline Does

1. Start with a local image file.
2. Run `cloudinary_jxl_picture.py`.
3. The script uploads the image to Cloudinary.
4. Cloudinary returns responsive breakpoints.
5. The script writes a `<picture>` block.
6. Paste that `<picture>` block into an Astro `.mdx` post.
7. Run/build Astro normally.

Astro will not show JXL files in `generating optimized images`, because Astro is
not generating the post image. Cloudinary is.

## Output Format Order

The generated post image is:

```html
<picture class="responsive-picture">
  <source type="image/jxl">
  <source type="image/avif">
  <source type="image/webp">
  <img src="...jpg">
</picture>
```

Browsers choose the first format they support:

- Safari with JXL support uses JXL.
- Browsers without JXL use AVIF or WebP.
- Older browsers use the JPEG `<img>` fallback.

## One-Time Setup

From this directory:

```bash
cd /Users/thor3/cloudinary-astro-jxl
```

Make sure the virtual environment has the dependencies:

```bash
  .venv/bin/python -m pip install cloudinary python-dotenv
```

Make sure `.env` contains:

```text
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

## Generate A Picture Block

Put the source image in:

```text
/Users/thor3/cloudinary-astro-jxl/images/
```

Then run:

```bash
cd /Users/thor3/cloudinary-astro-jxl
.venv/bin/python cloudinary_jxl_picture.py ./images/IMG_2141.jpeg --alt "Describe the image"
```
cloudinary_jxl_picture.py ./images/Image-1.jpg --alt "Describe the image"

The script writes:

```text
output/img_2141.html
output/img_2141.json
```

Use the `.html` file for the blog post.

## Insert Into An Astro Blog Post

Open the generated HTML:

```bash
open output/img_2141.html
```

Copy the full `<picture class="responsive-picture">...</picture>` block.

Paste it into the MDX post body, below the frontmatter:

```mdx
---
title: My Post
description: A post with a Cloudinary JXL image.
date: 2026-05-18
tags: ["JXL", "Cloudinary", "Astro"]
draft: false
---

<picture class="responsive-picture">
  ...
</picture>
```

The post file should live in the Astro content directory, for example:

```text
/Users/thor3/Documents/astro-whono/src/content/essay/my-post.mdx
```

## Build The Site

From the Astro site:

```bash
cd /Users/thor3/Documents/astro-whono
npm run build
```

Expected result:

- Astro builds the page.
- Cloudinary image URLs stay in the rendered HTML.
- Astro does not generate JXL files for this image.
- The browser loads the best supported format from Cloudinary.

## Verify In Browser

Open the post and check the selected image:

```js
document.querySelector('picture img')?.currentSrc
```

Expected examples:

```text
...f_jxl... .jxl
...f_avif... .avif
...f_webp... .webp
...f_jpeg... .jpg
```

If Safari supports JXL, the selected URL should usually contain:

```text
f_jxl
```

## Notes

- Keep `class="responsive-picture"` on the `<picture>` element so the site styles it correctly.
- Do not expect `npm run build` to list this image under optimized assets.
- The `.json` file is metadata only; it is useful for debugging widths, formats, and Cloudinary IDs.
- If a post image does not display, test the direct Cloudinary URLs from the generated HTML first.

