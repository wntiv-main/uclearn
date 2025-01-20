use std::iter::zip;

use js_sys::JsString;
use once_cell::sync::Lazy;
use regex::Regex;

use wasm_bindgen::prelude::*;
use web_sys::console;

static CM_ICONS_RX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?m)^\s*if.*hascourseindexcmicons(?:.|\n)*?}\s*;?\s*\n\s*$")
        .expect_throw("Icons regex failed")
});

static REQUIRES_RX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?m)^\s*require\(\[?(.*?)\]?,\s*function\s*\((.*)\)\s*\{([^{}]*?)\}\s*\)\s*;?")
        .expect_throw("Requires regex failed")
});

static CLEAN_JS_RX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?m)^[\s\n;]*|^\s*//.*$").expect_throw("Clean regex failed"));

#[wasm_bindgen]
pub fn optimise_js(js: JsString) -> Result<JsString, JsValue> {
    let js_src = js.as_string().expect_throw("Invalid string arg");

    console::time_with_label("rest_js");
    let rest_js = CM_ICONS_RX.replace_all(&js_src, "");
    console::time_end_with_label("rest_js");

    let mut final_deps: Vec<&str> = vec![];
    let mut contents = String::new();
    console::time_with_label("require_js");
    for (_, [deps_str, args_str, content]) in
        REQUIRES_RX.captures_iter(&rest_js).map(|c| c.extract())
    {
        let args = args_str.split(",").map(|arg| arg.trim());
        let deps = deps_str
            .split(",")
            .map(|dep| dep.trim_matches(&[' ', '\t', '\n', '\r', '\'', '"']));
        for (arg, dep) in zip(args, deps) {
            let arg_id: usize;
            if final_deps.iter().any(|x| *x == dep) {
                arg_id = final_deps.iter().position(|x| *x == dep).unwrap_throw();
            } else {
                arg_id = final_deps.len();
                final_deps.push(dep);
            }
            contents += &content.replace(arg, &("__".to_owned() + &arg_id.to_string()));
        }
    }
    console::time_end_with_label("require_js");
    let mut final_js = format!(
        "require([{}], ({}) => ((async () => {{console.time('courseIndexReactive');{};console.timeEnd('courseIndexReactive');}})()));",
        final_deps
            .iter()
            .fold(String::new(), |a, b| a + "," + &format!("\"{}\"", b))
            .trim_start_matches(','),
        final_deps
            .iter()
            .enumerate()
            .fold(String::new(), |a, (i, _el)| a + ",__" + &i.to_string())
            .trim_start_matches(','),
        contents
    );
    console::time_with_label("excess_js");
    final_js += &REQUIRES_RX.replace_all(&rest_js, "");
    console::time_end_with_label("excess_js");
    Ok(JsString::from(
        CLEAN_JS_RX.replace_all(&final_js, "").into_owned(),
        // final_js,
    ))
}
