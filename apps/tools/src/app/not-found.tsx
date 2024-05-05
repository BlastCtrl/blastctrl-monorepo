"use client";

import { Link } from "@blastctrl/ui";

export default function NotFound() {
  return (
    <div className="mx-auto grow p-4 text-center">
      <h2>404 - Page not found</h2>
      <p>Could not find requested resource</p>
      <Link className="underline hover:text-indigo-600" href="/">
        Return Home
      </Link>
    </div>
  );
}
