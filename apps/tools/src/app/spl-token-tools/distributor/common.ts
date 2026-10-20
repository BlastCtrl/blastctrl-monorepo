"use client";

import React from "react";

export const BATCH_SIZE = 20;
export const TOKEN_BATCH_SIZE = 4;
export const MAX_RECIPIENTS = 1000;

type ErrorBody = { error: string; message?: string; statusCode: number };

const isErrorBody = (data: unknown): data is ErrorBody =>
  typeof data === "object" &&
  data !== null &&
  "error" in data &&
  "statusCode" in data;

export class SolaceError extends Error {
  error: string;
  message: string;
  statusCode: number;

  constructor({ error, message, statusCode }: ErrorBody) {
    super(message);
    this.error = error;
    this.message = message ?? "";
    this.statusCode = statusCode;
    this.name = "SolaceError";
    Object.setPrototypeOf(this, SolaceError.prototype);
  }

  /**
   * From any non-success SDK response. The backend sends a JSON error body;
   * a proxy or gateway failure sends text, which is kept short for display.
   */
  static fromResponse({
    status,
    data,
  }: {
    status: number;
    data: unknown;
  }): SolaceError {
    if (isErrorBody(data)) return new SolaceError(data);
    return new SolaceError({
      error: `HTTP ${status}`,
      message:
        typeof data === "string" && data.trim()
          ? data.trim().slice(0, 200)
          : `Request failed with status ${status}`,
      statusCode: status,
    });
  }
}

export function useFadeIn() {
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 10);
    return () => clearTimeout(timer);
  }, []);

  return isVisible;
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
