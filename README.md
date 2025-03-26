# MooMo

> [!WARNING]
> MooMo is still in a **very** experimental beta phase. Many features aren't fully tested and could break at any time. See [](#beta-usage) for more information.

A client-side "mod" designed for [Moodle](https://moodle.org/) sites. Provides functionality such as a Python language server for [CodeRunner](https://coderunner.org.nz/) questions, better math-based input fields for [STACK](https://stack-assessment.org/), and a feature-rich CSS reset and theming support. The mod is distributed as a chrome extension, an should be usable on all Chromium browsers. Firefox is not (yet? contributions welcome!) supported.

## Beta usage

**Remember, at any point you may turn off the extension (at `chrome://extensions`) in order to use the page as normal**. At this point in time major concerns are math input fields and cross-page navigation. If you experience anything unexpected after clicking a button or link, try reloading the page. If you find a common occurance of this, **please** create a [new issue](https://github.com/wntiv-main/uclearn/issues/new/choose) with details, screenshots, links describing the issue. Likewise, if anything unexpected occurs while entering inputs into math fields, please [create an issue](https://github.com/wntiv-main/uclearn/issues/new/choose) describing the problem. **NOTE**: you may not see errors in the math-field's translation into STACK until it is too late!! **YOU MAY LOSE MARKS TO THIS, USE AT YOUR OWN RISK**. In general, any "simple" expressions should work fine, but "complex" objects (derivatives, greek letters, matrices, etc) may be risky. Again, please [report](https://github.com/wntiv-main/uclearn/issues/new/choose) anything you find not to work as expected.

### Known issues

- Coderunner questions' UI duplicating (browser shows dialog when this happens, reload to fix)
- Messaging drawer and notifications panel not opening after navigation (reload to fix)
- Coderunner questions dont always save until (pre-)checked (TODO: is this caused by us?) (copy before reloading)
- Matrices not implemented inside math fields (disable ext.)
- Many LaTeX commands not implemented in math fields

## Install

The extension can be installed by:

- Downloading the latest release build [here](TODO)
- Unzip the file to a known location
- Go to `chrome://extensions` in a new tab
- Check the `Developer mode` toggle
- Press `Load Unpacked`. A folder select dialog should pop up.
- Select the folder you unzipped before (this folder should contain a `manifest.json` file)
- You should now see the new Moodle UI when you access LEARN (You may need to reload any open tabs)

## Contributions

Contributions are welcome and encouraged! If you find a bug, please report it in our [GitHub Issues](https://github.com/wntiv-main/uclearn/issues). For developers, PRs are welcome, especially for bugfixes or CSS tweaks. Try avoid subjective thematic/aesthetic CSS (that would be better in personal user/theme CSS) in PRs, limit to layout bugs, overflows, LEARN CSS overrides, etc. Suggestions for aesthetic design  choices can be made in [GitHub Issues](https://github.com/wntiv-main/uclearn/issues).
