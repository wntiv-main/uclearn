var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);

// src/page-loader.ts
async function loadScript(script) {
  console.log("loading", script);
  if (script.src) {
    try {
      return `${await (await fetch(script.src, {
        priority: script.getAttribute("priority") ?? undefined
      })).text()}//# sourceURL=${script.src}`;
    } catch (e) {
      console.warn(e);
      return "";
    }
  }
  return script.text;
}
function execScript(script, content) {
  if (!content)
    return;
  const newScript = document.createElement("script");
  for (const attr of script.attributes) {
    if (attr.name === "src" || attr.name === "async" || attr.name === "defer")
      continue;
    newScript.setAttribute(attr.name, attr.value);
  }
  newScript.text = content;
  script.replaceWith(newScript);
}
async function loadPage() {
  const scripts = [];
  const asyncScripts = [];
  const deferScripts = [];
  for (const script of document.scripts) {
    if (script.id === "__uclearn_bootload_script_el")
      continue;
    if (script.type && !/j(ava)?s(cript)?/i.test(script.type) || script.hasAttribute("language") && !/j(ava)?s(cript)?/i.test(script.getAttribute("language") ?? ""))
      continue;
    const loadingScript = [script, loadScript(script)];
    if (script.async)
      asyncScripts.push(loadingScript);
    else if (script.defer)
      deferScripts.push(loadingScript);
    else
      scripts.push(loadingScript);
  }
  for (const [script, content] of scripts) {
    execScript(script, await content);
  }
  const runningAsyncScripts = Promise.all(asyncScripts.map(async ([script, content]) => {
    return execScript(script, await content);
  }));
  for (const [script, content] of deferScripts) {
    execScript(script, await content);
  }
  await runningAsyncScripts;
  return;
}

// src/index.ts
var require_src = __commonJS(() => {
  loadPage();
});
export default require_src();
