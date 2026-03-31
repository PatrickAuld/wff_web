// Simulate what happens
const xml = "<WatchFace/>";
const doc = new DOMParser().parseFromString(xml, "text/xml");
const root = doc.documentElement;

const width = parseInt(root.getAttribute("width") ?? "450", 10);
const height = parseInt(root.getAttribute("height") ?? "450", 10);

console.log("Parsed width:", width);
console.log("Parsed height:", height);

const scene = root.querySelector("Scene");
const backgroundColor = scene?.getAttribute("backgroundColor") ?? "#000000";

console.log("Scene:", scene);
console.log("Background color:", backgroundColor);
