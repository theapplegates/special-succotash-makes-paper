import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, relative, resolve } from "node:path";
import { v2 as cloudinary } from "cloudinary";

const imageRefs = process.argv.slice(2).filter(Boolean);
const outputPath = resolve("src/data/cloudinary-breakpoints.json");

const cloudName =
  process.env.CLOUDINARY_CLOUD_NAME || process.env.PUBLIC_CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!imageRefs.length) {
  console.error(
    "Usage: pnpm cloudinary:breakpoints <cloudinary-public-id-or-local-file> [...]"
  );
  process.exit(1);
}

if (!cloudName || !apiKey || !apiSecret) {
  console.error(
    "Missing Cloudinary credentials. Set CLOUDINARY_CLOUD_NAME or PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
  );
  process.exit(1);
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
});

const breakpointRequest = {
  create_derived: true,
  bytes_step: Number(process.env.CLOUDINARY_BREAKPOINT_BYTES_STEP || 20000),
  min_width: Number(process.env.CLOUDINARY_BREAKPOINT_MIN_WIDTH || 200),
  max_width: Number(process.env.CLOUDINARY_BREAKPOINT_MAX_WIDTH || 2000),
  max_images: Number(process.env.CLOUDINARY_BREAKPOINT_MAX_IMAGES || 10),
};

const readExistingBreakpoints = async () => {
  try {
    return JSON.parse(await readFile(outputPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
};

const getWidths = result =>
  result.responsive_breakpoints?.[0]?.breakpoints
    ?.map(breakpoint => breakpoint.width)
    .filter(width => Number.isFinite(width))
    .sort((a, b) => a - b);

const isLocalFile = async imageRef => {
  try {
    return (await stat(resolve(imageRef))).isFile();
  } catch {
    return false;
  }
};

const getPublicIdFromPath = imagePath => {
  const absolutePath = resolve(imagePath);
  const relativeToProject = relative(process.cwd(), absolutePath);
  const withoutExtension = relativeToProject.slice(
    0,
    -extname(relativeToProject).length
  );

  if (!withoutExtension.startsWith("..")) {
    return withoutExtension.replace(/^src\/assets\/images\//, "assets/images/");
  }

  return basename(imagePath, extname(imagePath));
};

const breakpointsByPublicId = await readExistingBreakpoints();

for (const imageRef of imageRefs) {
  const localFile = await isLocalFile(imageRef);
  const publicId = localFile ? getPublicIdFromPath(imageRef) : imageRef;
  const result = localFile
    ? await cloudinary.uploader.upload(resolve(imageRef), {
        public_id: publicId,
        overwrite: true,
        resource_type: "image",
        responsive_breakpoints: [breakpointRequest],
      })
    : await cloudinary.uploader.explicit(publicId, {
        type: "upload",
        resource_type: "image",
        responsive_breakpoints: [breakpointRequest],
      });
  const widths = getWidths(result);

  if (!widths?.length) {
    throw new Error(`Cloudinary did not return breakpoints for ${imageRef}`);
  }

  breakpointsByPublicId[publicId] = widths;
  console.log(
    `${publicId}${localFile ? ` (uploaded from ${imageRef})` : ""}: ${widths.join(", ")}`
  );
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(breakpointsByPublicId, null, 2)}\n`
);
