/**
 * Modern translations we don't own, shown one verse at a time in the verse
 * sheet's "Other translations" section and fetched live — most from API.Bible
 * (American Bible Society), the ESV from Crossway's own API, which is the only
 * place it is served. Nothing here is ever written to data/ or bundled into
 * the native app — the publishers licence display, not redistribution.
 *
 * This module is client-safe metadata only: which abbreviations are licensed
 * and what notice each publisher requires on display. Which of them are
 * actually switched on lives in the API_BIBLE_VERSIONS env var, read
 * server-side by lib/content/verse-api.ts — the sheet simply renders a notice
 * for any version it receives that appears here.
 */

export type LicensedMeta = {
  name: string;
  /** Edition year and translation approach, same fields as the on-disk texts
   *  (see TRANSLATION_INFO) so the compare list can sort and label them
   *  alongside each other. */
  year: number;
  approach: "word-for-word" | "balanced" | "thought-for-thought";
  note?: string;
  /** Which API serves it. The two have separate keys, separate allowances and
   *  separate terms, so this decides which path fetches the verse — and stops
   *  an abbreviation being configured against the wrong provider. */
  provider: "api.bible" | "crossway";
  publisher: string;
  publisherUrl: string;
  /** The publisher's required copyright line, shown wherever the text is. */
  notice: string;
};

/**
 * Standard publisher notices. API.Bible also returns a per-Bible copyright
 * string; verse-api.ts prefers that when present, so these are the fallback
 * and the client-side lookup. Check them against your account's terms before
 * switching a version on — the publisher's wording is theirs to dictate.
 */
export const LICENSED_META: Record<string, LicensedMeta> = {
  ESV: {
    name: "English Standard Version",
    year: 2016,
    approach: "word-for-word",
    note: "Crossway's term for its own approach is \"essentially literal\".",
    provider: "crossway",
    publisher: "Crossway",
    publisherUrl: "https://www.crossway.org",
    notice:
      "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), copyright © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.",
  },
  NIV: {
    name: "New International Version",
    year: 2011,
    approach: "balanced",
    provider: "api.bible",
    publisher: "Biblica",
    publisherUrl: "https://www.biblica.com",
    notice:
      "Scripture quotations taken from The Holy Bible, New International Version® NIV®. Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc. Used with permission. All rights reserved worldwide.",
  },
  NLT: {
    name: "New Living Translation",
    year: 2015,
    approach: "thought-for-thought",
    provider: "api.bible",
    publisher: "Tyndale House Publishers",
    publisherUrl: "https://tyndale.com",
    notice:
      "Holy Bible, New Living Translation, copyright © 1996, 2004, 2015 by Tyndale House Foundation. Used by permission of Tyndale House Publishers. All rights reserved.",
  },
  NASB: {
    name: "New American Standard Bible",
    year: 2020,
    approach: "word-for-word",
    provider: "api.bible",
    publisher: "The Lockman Foundation",
    publisherUrl: "https://www.lockman.org",
    notice:
      "Scripture quotations taken from the New American Standard Bible® (NASB), Copyright © 1960, 1971, 1977, 1995, 2020 by The Lockman Foundation. Used by permission. All rights reserved.",
  },
  CSB: {
    name: "Christian Standard Bible",
    year: 2017,
    approach: "balanced",
    provider: "api.bible",
    publisher: "Holman Bible Publishers",
    publisherUrl: "https://csbible.com",
    notice:
      "Scripture quotations taken from the Christian Standard Bible®, Copyright © 2017 by Holman Bible Publishers. Used by permission.",
  },
  NKJV: {
    name: "New King James Version",
    year: 1982,
    approach: "word-for-word",
    provider: "api.bible",
    publisher: "Thomas Nelson",
    publisherUrl: "https://www.thomasnelson.com",
    notice:
      "Scripture taken from the New King James Version®. Copyright © 1982 by Thomas Nelson. Used by permission. All rights reserved.",
  },
  GNT: {
    name: "Good News Translation",
    year: 1992,
    approach: "thought-for-thought",
    provider: "api.bible",
    publisher: "American Bible Society",
    publisherUrl: "https://www.americanbible.org",
    notice:
      "Scripture quotations taken from the Good News Translation® (Today's English Version, Second Edition). Copyright © 1992 American Bible Society. All rights reserved.",
  },
  CEV: {
    name: "Contemporary English Version",
    year: 1995,
    approach: "thought-for-thought",
    provider: "api.bible",
    publisher: "American Bible Society",
    publisherUrl: "https://www.americanbible.org",
    notice:
      "Scripture quotations taken from the Contemporary English Version. Copyright © 1995 American Bible Society. All rights reserved.",
  },
};

/** True when this abbreviation is a licensed (fetched, never stored) text. */
export function isLicensedVersion(abbr: string): boolean {
  return abbr in LICENSED_META;
}
