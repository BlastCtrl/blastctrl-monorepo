"use client";

import { HomeIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const Breadcrumbs = () => {
  const pathname = usePathname();

  type Breadcrumb = {
    name: string;
    href: string;
    current: boolean;
  };

  const segments = pathname.split("/").filter(Boolean);

  const breadcrumbs: Breadcrumb[] = segments.map((segment, index) => {
    const href = "/" + segments.slice(0, index + 1).join("/");
    const name = segment.replaceAll("-", " ");
    const current = index === segments.length - 1;

    return {
      name,
      href,
      current,
    };
  });

  // Do not show breadcrumbs if we're on the home page
  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <nav
      className="bg-accent/20 hidden border-b border-gray-200 lg:flex"
      aria-label="Breadcrumb"
    >
      <ol className="mx-auto flex h-10 w-full max-w-screen-xl space-x-4 px-4 sm:px-6 lg:px-8">
        <li className="flex">
          <Link
            href="/"
            className="flex items-center text-gray-400 hover:text-gray-500"
          >
            <HomeIcon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            <span className="sr-only">Home</span>
          </Link>
        </li>
        {breadcrumbs.map((item) => (
          <li key={item.name} className="flex">
            <div className="flex items-center">
              <svg
                className="h-full w-6 flex-shrink-0 text-gray-200"
                preserveAspectRatio="none"
                viewBox="0 0 24 44"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path d="M.293 0l22 22-22 22h1.414l22-22-22-22H.293z" />
              </svg>
              <Link
                href={`/${item.href}`}
                className="ml-4 text-sm font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700"
                aria-current={item.current ? "page" : undefined}
              >
                {item.name === "mev rewards"
                  ? "Withdraw MEV Rewards"
                  : item.name}
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </nav>
  );
};
