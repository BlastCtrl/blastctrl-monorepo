"use client";

import React from "react";

export const BATCH_SIZE = 20;
export const TOKEN_BATCH_SIZE = 4;
export const MAX_RECIPIENTS = 1000;

export class SolaceError extends Error {
  error: string;
  message: string;
  statusCode: number;

  constructor({
    error,
    message,
    statusCode,
  }: {
    error: string;
    message?: string;
    statusCode: number;
  }) {
    super(message);
    this.error = error;
    this.message = message ?? "";
    this.statusCode = statusCode;
    this.name = "SolaceError";
    Object.setPrototypeOf(this, SolaceError.prototype);
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
