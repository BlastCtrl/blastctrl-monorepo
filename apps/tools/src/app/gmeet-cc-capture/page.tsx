"use client";

import { useEffect, useRef } from "react";

const BOOKMARKLET_HREF =
  "javascript:(()=>{const u='https://tools.blastctrl.com/gmeet-cc-capture.js';const p=trustedTypes.createPolicy('blastctrl-gmeet-cc',{createScriptURL:x=>x});const s=document.createElement('script');s.src=p.createScriptURL(u);document.documentElement.appendChild(s)})()";

export default function GmeetCcCapture() {
  const linkRef = useRef<HTMLAnchorElement>(null);

  // React warns on (and may eventually block) javascript: URLs passed via the
  // href prop, so it's set imperatively after mount instead.
  useEffect(() => {
    linkRef.current?.setAttribute("href", BOOKMARKLET_HREF);
  }, []);

  return (
    <div className="mx-auto max-w-xl overflow-visible bg-white pb-5 sm:mb-6 sm:rounded-lg sm:p-6 sm:shadow">
      <header className="border-b border-gray-200 pb-4">
        <h1 className="font-display text-3xl font-semibold">
          GMeet CC Capture Bookmarklet
        </h1>
        <p className="mt-4 text-sm text-gray-500">
          Drag and drop this button to your bookmarks bar, then click it when
          you&apos;re in a Google Meet call.
        </p>
      </header>

      <div className="flex justify-center pt-8">
        <a
          ref={linkRef}
          className="inline-flex cursor-grab select-none items-center justify-center gap-x-2 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-500 active:cursor-grabbing"
        >
          BlastCtrl GMeet CC Capture
        </a>
      </div>
    </div>
  );
}
