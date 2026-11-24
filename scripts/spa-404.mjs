// GitHub Pages only serves pages built ahead of time. Records created later (a new product, employee, process...) have
// no page of their own, so Pages answers with 404.html. This turns 404.html into a redirector: for a detail URL such as
// /Org-360/ecosystem/ECO-123/ it remembers the real address and opens the prebuilt template page (…/ecosystem/__ID__/);
// the template restores the real address (see app/layout.tsx) and reads the id from it. Run after `next build`.
import { readFileSync, writeFileSync } from "node:fs";

const base = "/Org-360";
const file = "out/404.html";
const html = readFileSync(file, "utf8");

const loader = `<script>(function(){
var base=${JSON.stringify(base)};
var p=location.pathname;
if(p.indexOf(base+"/")!==0||p.indexOf("__ID__")>-1)return;
var parts=p.slice(base.length).split("/").filter(Boolean);
var one={employees:1,departments:1,teams:1,processes:1,ecosystem:1,compliance:1,"master-data":1,reports:1};
if(parts.length<2||!one[parts[0]]||!/^[A-Za-z0-9_.~%-]+$/.test(parts[1]))return;
try{sessionStorage.setItem("org360:spa",p+location.search+location.hash);}catch(e){return;}
parts[1]="__ID__";
location.replace(base+"/"+parts.join("/")+"/");
})();</script>`;

writeFileSync(file, html.replace("<head>", "<head>" + loader));
console.log("404.html loader added");
