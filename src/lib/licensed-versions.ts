/**
 * Modern translations we don't own, shown one verse at a time in the verse
 * sheet's "Other translations" section and fetched live from API.Bible
 * (American Bible Society). Nothing here is ever written to data/ or bundled
 * into the native app — the publishers licence display, not redistribution.
 *
 * This module is client-safe metadata only: which abbreviations are licensed
 * and what notice each publisher requires on display. Which of them are
 * actually switched on lives in the API_BIBLE_VERSIONS env var, read
 * server-side by lib/content/verse-api.ts — the sheet simply renders a notice
 * for any version it receives that appears here.
 */

export type LicensedMeta = {
  name: string;
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
  NIV: {
    name: "New International Version",
    publisher: "Biblica",
    publisherUrl: "https://www.biblica.com",
    notice:
      "Scripture quotations taken from The Holy Bible, New International Version® NIV®. Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc. Used with permission. All rights reserved worldwide.",
  },
  NLT: {
    name: "New Living Translation",
    publisher: "Tyndale House Publishers",
    publisherUrl: "https://tyndale.com",
    notice:
      "Holy Bible, New Living Translation, copyright © 1996, 2004, 2015 by Tyndale House Foundation. Used by permission of Tyndale House Publishers. All rights reserved.",
  },
  NASB: {
    name: "New American Standard Bible",
    publisher: "The Lockman Foundation",
    publisherUrl: "https://www.lockman.org",
    notice:
      "Scripture quotations taken from the New American Standard Bible® (NASB), Copyright © 1960, 1971, 1977, 1995, 2020 by The Lockman Foundation. Used by permission. All rights reserved.",
  },
  CSB: {
    name: "Christian Standard Bible",
    publisher: "Holman Bible Publishers",
    publisherUrl: "https://csbible.com",
    notice:
      "Scripture quotations taken from the Christian Standard Bible®, Copyright © 2017 by Holman Bible Publishers. Used by permission.",
  },
  NKJV: {
    name: "New King James Version",
    publisher: "Thomas Nelson",
    publisherUrl: "https://www.thomasnelson.com",
    notice:
      "Scripture taken from the New King James Version®. Copyright © 1982 by Thomas Nelson. Used by permission. All rights reserved.",
  },
  GNT: {
    name: "Good News Translation",
    publisher: "American Bible Society",
    publisherUrl: "https://www.americanbible.org",
    notice:
      "Scripture quotations taken from the Good News Translation® (Today's English Version, Second Edition). Copyright © 1992 American Bible Society. All rights reserved.",
  },
  CEV: {
    name: "Contemporary English Version",
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
