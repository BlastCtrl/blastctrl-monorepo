(function (root) {
  const SELECTORS = {
    region: '[role="region"][aria-label="Captions"]',
    item: ".nMcdL",
    speaker: ".NWpY1d",
    text: ".ygicle",
    timer: '[jsname="W5i7Bf"]',
  };
  const PANEL_ID = "gmeetcaptions-panel";
  const STATE_KEY = "__gmeetcaptionsState";
  const PANEL_REFRESH_KEY = "__gmeetcaptionsPanelRefresh";
  const STABILITY_POLLS = 4;
  const AVATAR_SEL = 'img[data-iml], img[src*="googleusercontent.com"]';
  const LOGO_SVG = "<!-- Generator: Adobe Illustrator 25.4.1, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->\n<svg version=\"1.1\" id=\"Layer_1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" x=\"0px\" y=\"0px\"\n\t viewBox=\"0 0 1613.32 321.29\" style=\"enable-background:new 0 0 1613.32 321.29;\" xml:space=\"preserve\">\n<style type=\"text/css\">\n\t.st0{fill:#FFFFFF;}\n\t.st1{fill:#E52525;}\n\t.st2{clip-path:url(#SVGID_00000132052289660210661090000000895540085860443537_);}\n\t.st3{clip-path:url(#SVGID_00000036964484384184954260000011331086843395650495_);fill:#E52525;}\n</style>\n<path class=\"st0\" d=\"M363.1,275.04v-25.67l22.73-4.4V91.71l-22.73-4.4V61.5h22.73h72.16c25.13,0,44.73,4.89,58.81,14.67\n\tc14.08,9.78,21.12,24.4,21.12,43.85c0,9.88-2.62,18.7-7.85,26.47c-5.23,7.77-12.83,13.62-22.81,17.53\n\tc8.51,1.86,15.62,5.13,21.34,9.83c5.72,4.69,10,10.39,12.83,17.09c2.83,6.7,4.25,14.01,4.25,21.93c0,20.44-6.75,35.91-20.24,46.42\n\tc-13.49,10.51-32.61,15.77-57.35,15.77H363.1z M428.66,150.97h30.8c11.44,0,20.24-2.35,26.4-7.04s9.24-11.54,9.24-20.53\n\tc0-9.87-3.1-17.16-9.31-21.85c-6.21-4.69-15.47-7.04-27.79-7.04h-29.33V150.97z M428.66,242.19h39.45c11.34,0,19.99-2.47,25.96-7.41\n\tc5.96-4.94,8.95-12.25,8.95-21.93c0-7.04-1.13-12.96-3.37-17.75c-2.25-4.79-5.7-8.41-10.34-10.85c-4.65-2.44-10.63-3.67-17.97-3.67\n\th-42.68V242.19z\"/>\n<path class=\"st0\" d=\"M558.89,275.04v-25.67l20.68-4.4V76.46l-22.88-4.4V46.25h65.7v198.73l20.68,4.4v25.67H558.89z\"/>\n<path class=\"st0\" d=\"M707.1,275.01c-15.74,0-28.26-4.23-37.55-12.69c-9.29-8.46-13.93-19.97-13.93-34.54\n\tc0-9.97,2.71-18.72,8.14-26.25c5.43-7.53,13.44-13.44,24.05-17.75c10.61-4.3,23.69-6.45,39.23-6.45h20.97V165.6\n\tc0-7.63-2.23-13.81-6.67-18.55c-4.45-4.74-11.12-7.11-20.02-7.11c-4.6,0-8.73,0.56-12.39,1.69c-3.67,1.12-6.97,2.71-9.9,4.77\n\tl-3.37,20.97h-30.8l-0.59-41.21c8.31-4.69,17.31-8.51,26.99-11.44c9.68-2.93,20.48-4.4,32.41-4.4c20.73,0,37.11,4.82,49.13,14.45\n\tc12.03,9.63,18.04,23.39,18.04,41.29v65.41c0,2.15,0.02,4.28,0.07,6.38c0.05,2.1,0.22,4.13,0.51,6.09l16.57,2.35v25.67h-53.09\n\tc-1.08-2.74-2.15-5.67-3.23-8.8c-1.08-3.13-1.86-6.26-2.35-9.39c-5.08,6.45-11.07,11.61-17.97,15.47\n\tC724.48,273.08,716.39,275.01,707.1,275.01z M718.54,243.33c5.96,0,11.63-1.34,17.01-4.03c5.38-2.69,9.53-6.23,12.47-10.63v-25.08\n\tH726.9c-9.39,0-16.5,2.15-21.34,6.45c-4.84,4.3-7.26,9.49-7.26,15.55c0,5.67,1.78,10.05,5.35,13.13\n\tC707.22,241.79,712.19,243.33,718.54,243.33z\"/>\n<path class=\"st0\" d=\"M886.31,275.12c-11.83,0-22.86-1.12-33.07-3.37c-10.22-2.25-20.02-5.47-29.41-9.68l-0.44-44.88h29.77\n\tl5.72,22.88c3.32,1.66,6.97,2.98,10.93,3.96c3.96,0.98,8.48,1.47,13.57,1.47c9.58,0,16.33-1.56,20.24-4.69\n\tc3.91-3.13,5.87-7.04,5.87-11.73c0-4.4-2.08-8.29-6.23-11.66c-4.16-3.37-12.44-6.33-24.86-8.87c-18.77-3.91-32.61-9.97-41.51-18.19\n\tc-8.9-8.21-13.35-18.72-13.35-31.53c0-8.8,2.22-16.82,6.67-24.05c4.45-7.23,11.24-13.05,20.39-17.45c9.14-4.4,20.85-6.6,35.13-6.6\n\tc11.93,0,22.85,1.15,32.78,3.45c9.92,2.3,18.26,5.31,25.01,9.02l0.44,43.41h-29.63l-4.55-20.83c-2.64-1.96-5.75-3.42-9.31-4.4\n\tc-3.57-0.98-7.6-1.47-12.1-1.47c-7.53,0-13.3,1.52-17.31,4.55c-4.01,3.03-6.01,6.94-6.01,11.73c0,2.74,0.71,5.28,2.13,7.63\n\tc1.42,2.35,4.23,4.55,8.43,6.6c4.2,2.05,10.31,4.01,18.33,5.87c19.65,4.5,33.98,10.49,42.97,17.97\n\tc8.99,7.48,13.49,17.97,13.49,31.46c0,14.76-5.35,26.69-16.06,35.79S907.63,275.12,886.31,275.12z\"/>\n<path class=\"st0\" d=\"M1034.24,275.12c-14.77,0-26.13-4.06-34.1-12.17c-7.97-8.12-11.95-20.97-11.95-38.57v-80.96h-21.85v-30.07\n\th21.85V74.49h42.68v38.87h29.19v30.07h-29.19v80.81c0,6.16,1.29,10.56,3.89,13.2c2.59,2.64,6.13,3.96,10.63,3.96\n\tc2.35,0,4.89-0.17,7.62-0.51c2.74-0.34,5.08-0.71,7.04-1.1l3.67,30.95c-4.4,1.27-9.17,2.32-14.3,3.15\n\tC1044.29,274.71,1039.23,275.12,1034.24,275.12z\"/>\n<path class=\"st1\" d=\"M1218.94,275.12c-20.73,0-38.77-4.33-54.12-12.98c-15.35-8.65-27.21-20.92-35.57-36.81\n\tc-8.36-15.89-12.54-34.69-12.54-56.39v-7.19c0-20.73,4.03-39.09,12.1-55.07c8.07-15.99,19.58-28.53,34.54-37.62\n\tc14.96-9.09,32.75-13.64,53.38-13.64c14.47,0,28.04,2.05,40.7,6.16c12.66,4.11,23.98,10.36,33.95,18.77v51.62h-31.83l-4.4-32.41\n\tc-3.23-2.35-6.75-4.35-10.56-6.01c-3.81-1.66-7.95-2.93-12.39-3.81c-4.45-0.88-9.26-1.32-14.45-1.32c-12.12,0-22.54,2.98-31.24,8.95\n\tc-8.7,5.97-15.38,14.4-20.02,25.3c-4.64,10.9-6.97,23.83-6.97,38.79v7.48c0,14.96,2.44,27.92,7.33,38.87\n\tc4.89,10.95,11.83,19.43,20.83,25.45c8.99,6.01,19.65,9.02,31.97,9.02c6.16,0,12.34-0.71,18.55-2.13c6.21-1.42,11.85-3.25,16.94-5.5\n\tl4.4-30.07h31.83v51.04c-8.31,5.48-18.68,10.1-31.09,13.86C1247.88,273.24,1234.1,275.12,1218.94,275.12z\"/>\n<path class=\"st1\" d=\"M1374.4,275.12c-14.76,0-26.13-4.06-34.1-12.17c-7.97-8.12-11.95-20.97-11.95-38.57v-80.96h-21.85v-30.07h21.85\n\tV74.49h42.68v38.87h29.19v30.07h-29.19v80.81c0,6.16,1.29,10.56,3.89,13.2c2.59,2.64,6.13,3.96,10.63,3.96\n\tc2.35,0,4.89-0.17,7.63-0.51c2.74-0.34,5.08-0.71,7.04-1.1l3.67,30.95c-4.4,1.27-9.17,2.32-14.3,3.15\n\tC1384.45,274.71,1379.39,275.12,1374.4,275.12z\"/>\n<path class=\"st1\" d=\"M1419.1,275.04v-25.67l20.53-4.4v-98.41l-22.73-4.4v-25.81h62.62l1.61,19.65l0.29,3.52\n\tc3.91-8.6,8.75-15.11,14.52-19.51c5.77-4.4,12.66-6.6,20.68-6.6c2.54,0,5.33,0.22,8.36,0.66c3.03,0.44,5.72,1,8.07,1.69l-4.55,39.45\n\tl-21.27-1.17c-6.06-0.29-10.98,0.73-14.74,3.08c-3.77,2.35-7.11,5.72-10.05,10.12v77.73l20.53,4.4v25.67H1419.1z\"/>\n<path class=\"st1\" d=\"M1529.13,275.04v-25.67l20.68-4.4V76.46l-22.88-4.4V46.25h65.71v198.73l20.68,4.4v25.67H1529.13z\"/>\n<g>\n\t<g>\n\t\t<defs>\n\t\t\t<rect id=\"SVGID_1_\" x=\"0\" width=\"322.06\" height=\"321.29\"/>\n\t\t</defs>\n\t\t<clipPath id=\"SVGID_00000104667824236681084710000002403853239525068954_\">\n\t\t\t<use xlink:href=\"#SVGID_1_\"  style=\"overflow:visible;\"/>\n\t\t</clipPath>\n\t\t<g style=\"clip-path:url(#SVGID_00000104667824236681084710000002403853239525068954_);\">\n\t\t\t<defs>\n\t\t\t\t<rect id=\"SVGID_00000036250642162500850670000001456047232886982802_\" x=\"0\" width=\"322.06\" height=\"321.29\"/>\n\t\t\t</defs>\n\t\t\t<clipPath id=\"SVGID_00000047045156998590951120000004543862909279932316_\">\n\t\t\t\t<use xlink:href=\"#SVGID_00000036250642162500850670000001456047232886982802_\"  style=\"overflow:visible;\"/>\n\t\t\t</clipPath>\n\t\t\t<path style=\"clip-path:url(#SVGID_00000047045156998590951120000004543862909279932316_);fill:#E52525;\" d=\"M71.91,199.3\n\t\t\t\tc7.31-11.96,17.75-19.37,30.24-24.72c0.91-0.39,1.87,0.4,1.69,1.37c-0.01,0.05-0.02,0.1-0.03,0.15\n\t\t\t\tc-2.02,8.66-3.8,17.39-6.15,25.96c-2.59,9.44,0.77,16.54,9.04,21.88c9.78,6.31,20.05,11.88,30.24,17.52\n\t\t\t\tc6.85,3.79,13.02,2.9,18.92-2.45c7.12-6.45,14.09-13.07,21.12-19.61c0.24-0.22,0.48-0.45,0.73-0.68\n\t\t\t\tc0.72-0.67,1.91-0.25,2.04,0.72c0.96,6.84,0.92,13.36-0.02,19.88c-0.92,6.38-2.8,12.46-6.29,18.58c-0.51,0.9,0.23,1.99,1.25,1.83\n\t\t\t\tc1.86-0.3,3.47-0.55,5.05-0.92c27.55-6.43,50.07-20.92,67.56-43c5.32-6.72,10.06-14.07,14.03-21.67\n\t\t\t\tc6.76-12.93,6.15-26.38-0.16-39.33c-2.91-5.97-6.93-11.4-10.76-17.48c-0.24-0.37-0.25-0.85-0.04-1.24\n\t\t\t\tc14.25-26.45,23.3-55.12,23.42-86.88c0-1.09,1.33-1.62,2.1-0.84c16.9,17.24,29.12,36.71,36.79,58.97\n\t\t\t\tc13.65,39.61,12.57,78.97-4.38,117.32C272.35,306.02,187.26,334,121.17,316.12c-0.86-0.23-1.18-1.28-0.61-1.97\n\t\t\t\tc0.97-1.17,1.91-2.3,2.82-3.45c10.66-13.53,12.85-28.55,7.67-44.77c-0.38-1.2-1.52-2.44-2.63-3.09\n\t\t\t\tc-12.65-7.45-25.35-14.83-38.11-22.08c-1.3-0.74-3.26-1.01-4.73-0.68c-18.19,4.1-30.25,14.99-35.91,32.83\n\t\t\t\tc-0.08,0.24-0.16,0.49-0.24,0.73c-0.28,0.84-1.35,1.11-1.99,0.5C2.28,231.41-18.78,151.42,21.13,81.5\n\t\t\t\tC63.47,7.32,145.75-11,202.48,5.73c1.03,0.3,1.19,1.7,0.25,2.23c-19.08,10.81-35.08,25.18-48.51,42.4\n\t\t\t\tc-5.24,6.72-9.99,13.83-14.75,20.9c-1.12,1.66-2.06,1.88-3.86,1.52c-12.57-2.56-24.84-1.81-36.41,4.12\n\t\t\t\tc-8.04,4.12-13.96,10.44-18.54,18.27c-12.73,21.78-18.89,45.16-17.76,70.38c0.5,11.27,2.61,22.25,6.53,32.85\n\t\t\t\tc0.09,0.26,0.2,0.51,0.32,0.77C70.15,200.08,71.4,200.15,71.91,199.3\"/>\n\t\t\t<path style=\"clip-path:url(#SVGID_00000047045156998590951120000004543862909279932316_);fill:#E52525;\" d=\"M82.26,269.27\n\t\t\t\tc8.43,4.86,16.83,9.71,25.26,14.57c5.62,3.24,6.1,11.23,0.86,15.05c-0.04,0.03-0.07,0.05-0.11,0.08\n\t\t\t\tc-7.73,5.6-16.5,9.26-25.08,13.24c-2.96,1.37-6.16,2.23-9.24,3.34c-1.28,0.46-2.08,0.13-2.34-1.28\n\t\t\t\tc-0.58-3.15-1.45-6.28-1.73-9.45c-0.82-9.35-2.06-18.71-1.13-28.13c0.02-0.19,0.04-0.38,0.06-0.57\n\t\t\t\tC69.49,269.63,76.62,266.01,82.26,269.27\"/>\n\t\t\t<path style=\"clip-path:url(#SVGID_00000047045156998590951120000004543862909279932316_);fill:#E52525;\" d=\"M203.37,19.58\n\t\t\t\tc-0.56-0.32-0.54-1.15,0.05-1.43c9.21-4.43,18.27-7.66,27.8-9.37c5.78-1.04,11.66-1.47,17.51-2.03c0.79-0.07,2.08,0.52,2.44,1.18\n\t\t\t\tc7.78,14.11,11.93,29.29,13.04,45.33c0,0,0,0.01,0,0.01c0.04,0.63-0.67,1.04-1.21,0.72C243.15,42.53,223.48,31.18,203.37,19.58\"\n\t\t\t\t/>\n\t\t</g>\n\t</g>\n</g>\n</svg>";

  const normalize = (text = "") => String(text).replace(/\s+/g, " ").trim();
  const formatDuration = (ms) => {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  };
  const findLast = (arr, pred) => {
    for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return arr[i];
  };

  function getRegion(doc = root.document) {
    return (
      doc.querySelector(SELECTORS.region) ||
      [...doc.querySelectorAll('[role="region"][aria-label], [aria-label="Captions"]')].find(
        (node) => normalize(node.getAttribute?.("aria-label")) === "Captions",
      ) ||
      null
    );
  }

  function isItem(node) {
    return node.nodeType === 1 && (node.matches?.(SELECTORS.item) || !!node.querySelector?.(AVATAR_SEL));
  }

  function closestItem(node) {
    let el = node.nodeType === 3 ? node.parentElement : node;
    while (el) {
      if (isItem(el)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function getItems(region) {
    const byClass = [...region.querySelectorAll(SELECTORS.item)];
    if (byClass.length) return byClass;
    return [...region.children].filter((el) => el.querySelector(AVATAR_SEL));
  }

  function getSpeakerEl(item) {
    return (
      item.querySelector(SELECTORS.speaker) ||
      item.querySelector("span")
    );
  }

  function getTextEl(item) {
    return (
      item.querySelector(SELECTORS.text) ||
      findLast([...item.children], (el) => el.tagName === "DIV" && !el.querySelector(AVATAR_SEL))
    );
  }

  function readTurn(item) {
    const speaker = normalize(getSpeakerEl(item)?.textContent || "");
    const text = normalize(getTextEl(item)?.textContent || "");
    if (!speaker || !text) return null;
    return { speaker, text };
  }

  function rawTurns(doc = root.document) {
    const region = getRegion(doc);
    if (!region) return [];
    const items = getItems(region);
    if (items.length > 0) return items.map(readTurn).filter(Boolean);
    return [...region.querySelectorAll(SELECTORS.text)].map((n) => readTurn(n.closest("div"))).filter(Boolean);
  }

  function mergeTurns(turns) {
    return turns.reduce((out, turn) => {
      const previous = out.at(-1);
      if (!previous || previous.speaker !== turn.speaker) {
        out.push({ ...turn });
        return out;
      }
      if (turn.text === previous.text || previous.text.endsWith(turn.text)) return out;
      if (turn.text.startsWith(previous.text)) {
        previous.text = turn.text;
        return out;
      }
      previous.text = `${previous.text}
${turn.text}`;
      return out;
    }, []);
  }

  function renderText(turns) {
    if (turns.length === 0) return "";
    let previousSpeaker = null;
    return turns
      .map(({ speaker, text }) => {
        const prefix = previousSpeaker && previousSpeaker !== speaker ? "\n" : "";
        previousSpeaker = speaker;
        return `${prefix}${speaker}: ${text}`;
      })
      .join("\n")
      .trim();
  }

  function extractCaptions(doc = root.document) {
    return renderText(mergeTurns(rawTurns(doc)));
  }

  function getMeta(doc = root.document, win = root) {
    const title = normalize(
      doc.querySelector("[data-meeting-title]")?.getAttribute("data-meeting-title") ||
        doc.title.replace(/^Meet\s*[-–]\s*/, ""),
    );
    const code = (win.location?.pathname || "").replace(/^\//, "");
    const duration = doc.querySelector(SELECTORS.timer)?.textContent?.trim() || "";
    return { title, code, duration };
  }

  function getStreamState() {
    return root[STATE_KEY] || null;
  }

  function trackItem(el, state) {
    if (state.seenItems.has(el)) return;
    const turn = readTurn(el);
    if (!turn) return;
    state.seenItems.set(el, { ...turn, stalePollCount: 0, finalized: false });
  }

  function refreshItem(el, state) {
    const entry = state.seenItems.get(el);
    if (!entry) return;
    const turn = readTurn(el);
    if (!turn) return;
    if (entry.text !== turn.text) {
      if (entry.finalized) entry.finalized = false;
      entry.text = turn.text;
      entry.stalePollCount = 0;
    } else if (!entry.finalized) {
      entry.stalePollCount++;
    }
  }

  function renderEntry(entry, state) {
    if (entry.filePrefix === undefined) {
      if (!state.wroteAnyTurns) entry.filePrefix = "";
      else entry.filePrefix = state.lastWrittenSpeaker === entry.speaker ? "" : "\n";
    }
    return `${entry.filePrefix}${entry.speaker}: ${entry.text}
`;
  }

  async function writeItem(entry, state) {
    if (entry.finalized) return;
    const content = renderEntry(entry, state);
    const bytes = new TextEncoder().encode(content).length;
    try {
      if (entry.filePosition !== undefined && entry.filePosition + entry.fileLength === state.filePosition) {
        await state.writable.seek(entry.filePosition);
        await state.writable.write(content);
        await state.writable.truncate(entry.filePosition + bytes);
        state.filePosition = entry.filePosition + bytes;
      } else {
        entry.filePosition = state.filePosition;
        await state.writable.write(content);
        state.filePosition += bytes;
        state.savedCount++;
        state.wroteAnyTurns = true;
        state.lastWrittenSpeaker = entry.speaker;
      }
      entry.fileLength = bytes;
    } catch (e) {
      state.status = "error";
      console.error("gmeetcaptions:", e);
    }
    entry.finalized = true;
  }

  async function startStreaming(doc = root.document, win = root) {
    if (getStreamState()?.running) return;
    if (typeof win.showSaveFilePicker !== "function") {
      root[STATE_KEY] = { running: false, status: "error", savedCount: 0 };
      updatePanel(doc);
      (win.alert ?? console.warn)("File saving is not supported in this browser.");
      return;
    }

    root[STATE_KEY] = { running: false, status: "choosing", savedCount: 0 };
    updatePanel(doc);

    const meta = getMeta(doc, win);
    let writable;
    try {
      const fileHandle = await win.showSaveFilePicker({
        suggestedName: `meet-${meta.code || "captions"}-${new Date().toISOString().slice(0, 10)}.txt`,
        types: [{ description: "Text", accept: { "text/plain": [".txt"] } }],
      });
      writable = await fileHandle.createWritable();
    } catch (e) {
      root[STATE_KEY] = { running: false, status: e?.name === "AbortError" ? "cancelled" : "error", savedCount: 0 };
      if (e?.name !== "AbortError") console.error("gmeetcaptions:", e);
      updatePanel(doc);
      return;
    }

    const startedAt = Date.now();
    const header = [
      meta.title || "Google Meet",
      `Meeting code: ${meta.code}`,
      `Started: ${new Date(startedAt).toLocaleString()}`,
      "",
    ].join("\n");
    await writable.write(header);
    const filePosition = new TextEncoder().encode(header).length;

    const state = {
      running: true,
      status: "capturing",
      writable,
      startedAt,
      filePosition,
      seenItems: new Map(),
      observer: null,
      stabilityTimer: null,
      savedCount: 0,
      wroteAnyTurns: false,
      lastWrittenSpeaker: null,
    };
    root[STATE_KEY] = state;

    const region = getRegion(doc);
    if (region) {
      getItems(region).forEach((el) => trackItem(el, state));

      state.observer = new MutationObserver((mutations) => {
        for (const mut of mutations) {
          for (const node of mut.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (isItem(node)) trackItem(node, state);
            else node.querySelectorAll?.(SELECTORS.item)?.forEach((n) => trackItem(n, state));
          }
          for (const node of mut.removedNodes) {
            if (node.nodeType !== 1) continue;
            const els = isItem(node) ? [node] : [...(node.querySelectorAll?.(SELECTORS.item) ?? [])];
            for (const el of els) {
              const entry = state.seenItems.get(el);
              if (entry) writeItem(entry, state).then(() => updatePanel(doc));
            }
          }
          if (mut.type === "characterData" || mut.type === "childList") {
            const el = closestItem(mut.target);
            if (el) refreshItem(el, state);
          }
        }
      });
      state.observer.observe(region, { childList: true, subtree: true, characterData: true });
    }

    state.stabilityTimer = setInterval(async () => {
      for (const [el, entry] of state.seenItems) {
        if (!entry.finalized) {
          refreshItem(el, state);
          if (entry.stalePollCount >= STABILITY_POLLS) await writeItem(entry, state);
        }
      }
      updatePanel(doc);
    }, 1000);

    win.addEventListener("pagehide", () => stopStreaming(doc, win), { once: true });
    updatePanel(doc);
  }

  async function stopStreaming(doc = root.document, win = root) {
    const state = getStreamState();
    if (!state?.running) return;
    state.running = false;
    state.status = "saving";
    updatePanel(doc);
    clearInterval(state.stabilityTimer);
    state.observer?.disconnect();
    for (const [, entry] of state.seenItems) await writeItem(entry, state);
    const meta = getMeta(doc, win);
    const elapsed = formatDuration(Date.now() - state.startedAt);
    try {
      await state.writable.write(
        `
Stopped: ${new Date().toLocaleString()} — Duration: ${meta.duration || elapsed}
`,
      );
      await state.writable.close();
      state.status = "saved";
    } catch (e) {
      state.status = "error";
      console.error("gmeetcaptions:", e);
    }
    updatePanel(doc);
  }

  function statusText(state) {
    if (!state || state.status === "ready") return "Ready";
    if (state.status === "choosing") return "Choosing file…";
    if (state.status === "capturing") return `Capturing · ${formatDuration(Date.now() - state.startedAt)}`;
    if (state.status === "saving") return "Saving…";
    if (state.status === "saved") return "Saved";
    if (state.status === "cancelled") return "Cancelled";
    return "Error";
  }

  function statusColor(state) {
    if (!state || state.status === "ready" || state.status === "saved") return "#a6e3a1";
    if (state.status === "choosing" || state.status === "saving") return "#f5f5f5";
    return "#f38ba8";
  }

  function updatePanel(doc = root.document) {
    if (!doc.getElementById(PANEL_ID)) {
      if (root[PANEL_REFRESH_KEY]) {
        clearInterval(root[PANEL_REFRESH_KEY]);
        root[PANEL_REFRESH_KEY] = null;
      }
      return;
    }
    const statusEl = doc.getElementById("gmeetcaptions-status");
    const statusDot = statusEl?.previousElementSibling;
    const ccEl = doc.getElementById("gmeetcaptions-cc");
    const turnsEl = doc.getElementById("gmeetcaptions-turns");
    const btn = doc.getElementById("gmeetcaptions-record");
    if (!statusEl || !ccEl || !turnsEl || !btn) return;
    const state = getStreamState();
    const ccDetected = !!getRegion(doc);

    statusEl.textContent = statusText(state);
    statusEl.style.color = statusColor(state);
    if (statusDot) statusDot.style.display = state?.status === "capturing" ? "inline-block" : "none";
    ccEl.textContent = ccDetected ? "Detected" : "NOT DETECTED";
    ccEl.style.color = ccDetected ? "#cdd6f4" : "#f38ba8";
    ccEl.style.fontWeight = ccDetected ? "400" : "800";
    turnsEl.textContent = String(state?.savedCount ?? 0);

    if (state?.running) {
      btn.textContent = "■ Stop Capturing";
      btn.style.background = "#f38ba8";
    } else {
      btn.textContent = "● Start Capturing";
      btn.style.background = "#a6e3a1";
    }
  }

  function makeLogo(doc) {
    const img = doc.createElement("img");
    img.alt = "BlastCtrl";
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG)}`;
    Object.assign(img.style, { width: "112px", height: "auto", display: "block" });
    return img;
  }

  function showPanel(doc = root.document, win = root) {
    if (win.location?.hostname !== "meet.google.com") {
      (win.alert ?? console.warn)("You're not currently on Google Meet.");
      return;
    }
    const existing = doc.getElementById(PANEL_ID);
    if (existing) {
      existing.style.display = "";
      if (!root[PANEL_REFRESH_KEY]) root[PANEL_REFRESH_KEY] = setInterval(() => updatePanel(doc), 1000);
      updatePanel(doc);
      return;
    }
    const panel = doc.createElement("div");
    panel.id = PANEL_ID;
    Object.assign(panel.style, {
      position: "fixed",
      top: "80px",
      right: "16px",
      zIndex: "999999",
      width: "150px",
      boxSizing: "border-box",
      background: "#1e1e2e",
      color: "#cdd6f4",
      borderRadius: "12px",
      padding: "12px 14px",
      fontFamily: "Roboto, Arial, sans-serif",
      fontSize: "12px",
      boxShadow: "0 4px 24px rgba(0,0,0,.5)",
      border: "1px solid #313244",
    });
    const makeEl = (tag, styles, text) => {
      const el = doc.createElement(tag);
      if (styles) Object.assign(el.style, styles);
      if (text) el.textContent = text;
      return el;
    };

    const header = makeEl("div", { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "10px" });
    const brand = makeEl("div", { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "5px" });
    const title = makeEl(
      "strong",
      { color: "#f5f5f5", fontFamily: "Roboto, Arial, sans-serif", fontSize: "13px", lineHeight: "1.05", fontWeight: "700", letterSpacing: ".1px", whiteSpace: "nowrap" },
      "GMeet CC Capture",
    );
    const closeBtn = makeEl(
      "button",
      { position: "absolute", top: "2px", right: "4px", marginTop: "0", background: "none", border: "none", color: "#cdd6f4", cursor: "pointer", fontSize: "18px", padding: "0", lineHeight: "1" },
      "×",
    );
    closeBtn.id = "gmeetcaptions-close";
    brand.append(makeLogo(doc), title);
    header.append(brand, closeBtn);

    const status = makeEl("div", { fontSize: "12px", marginBottom: "8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: "5px" });
    const statusDot = makeEl("span", { display: "none", width: "7px", height: "7px", borderRadius: "50%", background: "#E52525", flex: "0 0 auto" });
    const statusText = makeEl("span", null, "Ready");
    statusText.id = "gmeetcaptions-status";
    status.append(statusDot, statusText);

    const stats = makeEl("div", { display: "flex", flexDirection: "column", gap: "3px", fontSize: "12px", marginBottom: "10px" });
    const ccLine = makeEl("div");
    const ccLabel = makeEl("span", { color: "#a6adc8" }, "CC: ");
    const ccValue = makeEl("span", null, "NOT DETECTED");
    ccValue.id = "gmeetcaptions-cc";
    ccLine.append(ccLabel, ccValue);
    const turnsLine = makeEl("div");
    const turnsLabel = makeEl("span", { color: "#a6adc8" }, "Turns saved: ");
    const turnsValue = makeEl("span", null, "0");
    turnsValue.id = "gmeetcaptions-turns";
    turnsLine.append(turnsLabel, turnsValue);
    stats.append(ccLine, turnsLine);

    const recordBtn = makeEl(
      "button",
      { background: "#a6e3a1", color: "#1e1e2e", border: "none", borderRadius: "6px", padding: "5px 11px", cursor: "pointer", fontSize: "12px", fontWeight: "700", fontFamily: "inherit" },
      "● Start Capturing",
    );
    recordBtn.id = "gmeetcaptions-record";

    panel.append(header, status, stats, recordBtn);
    doc.body.appendChild(panel);
    if (!root[PANEL_REFRESH_KEY]) root[PANEL_REFRESH_KEY] = setInterval(() => updatePanel(doc), 1000);
    closeBtn.onclick = () => {
      panel.style.display = "none";
    };
    recordBtn.onclick = async () => {
      if (getStreamState()?.running) await stopStreaming(doc, win);
      else await startStreaming(doc, win);
    };
    updatePanel(doc);
  }

  root.gmeetcaptions = {
    extractCaptions,
    getMeta,
    startStreaming,
    stopStreaming,
    showPanel,
    scrape: showPanel,
  };
})(typeof window === "undefined" ? globalThis : window);
gmeetcaptions.showPanel();
