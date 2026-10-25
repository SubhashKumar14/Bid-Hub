export const CATEGORIES = ["Product Design", "Web Development", "Backend & APIs", "Writing & Content", "Video & Motion", "Graphic Design", "Data & Research"];
const aliases = { "Writing & Editing": "Writing & Content", "Brand Identity": "Graphic Design", Research: "Data & Research", "Data & AI": "Data & Research" };
export const canonicalCategory = value => Object.hasOwn(aliases,value) ? aliases[value] : value;
