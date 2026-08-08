"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

// Real content from the app, mirroring the reader exactly: John 1:1-13 (BSB)
// across two BSB section headings, and the verse-tools sheet (Tyndale study
// notes, cross-references, the original-words reverse interlinear, other
// translations) — all real data for each of these thirteen verses.


/** One original word in the reverse interlinear, as /api/interlinear serves
 * it — `gk`/`en` are the word's rank in the Greek and BSB reading orders. */
type MockWord = {
  id: number;
  orig: string;
  bsb: string;
  gk: number;
  en: number;
  translit: string;
  parse: string;
  strong: string;
  gloss: string;
  lemma: string;
  def: string;
  kjv: string;
};

type VerseData = {
  bsb: string;
  notes: { range: string; text: string }[];
  refs: { label: string; text: string }[];
  refCount: number;
  words: MockWord[];
  versions: { abbr: string; text: string }[];
};

const VERSES: Record<number, VerseData> = {
  1: {
    bsb: "In the beginning was the Word, and the Word was with God, and the Word was God.",
    notes: [
      {
        range: "1:1",
        text: "Echoing Genesis 1:1, John’s Gospel introduces Jesus Christ, through whom God created everything (John 1:3); Jesus also creates new life in those who believe (John 1:12-13). The Gospel opens with its central affirmation, that Jesus Christ, the Word (Greek logos), not only revealed God but was God. In Greek thought, the logos was the rational principle guiding the universe and making life coherent. For Jewish people, the logos was the word of the Lord, an expression of God’s wisdom and creative power. By Jesus’ time, the logos was viewed as coming from God and having his personality (see Psalm 33:6, Psalm 33:9; Proverbs 8:22-31); John affirmed this understanding (John 1:14).",
      },
      {
        range: "1:1-18",
        text: "The beginning of this prologue (John 1:1-5) might be a poem or hymn sung by the earliest Christians. The prologue’s themes—the coming of the light into the world, the rejection of the light, and its gift of new life to believers—prepares readers for the story that follows.",
      },
    ],
    refs: [
      {
        label: "Genesis 1:1",
        text: "In the beginning God created the heavens and the earth.",
      },
      {
        label: "John 17:5",
        text: "And now, Father, glorify Me in Your presence with the glory I had with You before the world existed.",
      },
      {
        label: "Revelation 19:13",
        text: "He is dressed in a robe dipped in blood, and His name is The Word of God.",
      },
    ],
    refCount: 12,
    words: [
      { id: 0, orig: "Ἐν", bsb: "In", gk: 0, en: 0, translit: "En", parse: "Prep", strong: "G1722", gloss: "in", lemma: "ἐν", def: "\"in,\" at, (up-)on, by, etc.", kjv: "about, after, against, + almost, X altogether, among, X as, at, before, between, (here-)by (+ all means), for (… sake of), + give self wholly to, (here-)in(-to, -wardly), X mightily, (because) of, (up-)on, (open-)ly, X outwardly, one, X quickly, X shortly, (speedi-)ly, X that, X there(-in, -on), through(-out), (un-)to(-ward), under, when, where(-with), while, with(-in)" },
      { id: 1, orig: "ἀρχῇ", bsb: "the beginning", gk: 1, en: 1, translit: "archē", parse: "N-DFS", strong: "G746", gloss: "beginning", lemma: "ἀρχή", def: "(properly abstract) a commencement, or (concretely) chief (in various applications of order, time, place, or rank)", kjv: "beginning, corner, (at the, the) first (estate), magistrate, power, principality, principle, rule" },
      { id: 2, orig: "ἦν", bsb: "was", gk: 2, en: 2, translit: "ēn", parse: "V-IIA-3S", strong: "G1510", gloss: "is", lemma: "εἰμί", def: "I exist (used only when emphatic)", kjv: "am, have been, X it is I, was" },
      { id: 3, orig: "ὁ", bsb: "the", gk: 3, en: 3, translit: "ho", parse: "Art-NMS", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 4, orig: "Λόγος", bsb: "Word", gk: 4, en: 4, translit: "Logos", parse: "N-NMS", strong: "G3056", gloss: "word", lemma: "λόγος", def: "something said (including the thought); by implication, a topic (subject of discourse), also reasoning (the mental faculty) or motive; by extension, a computation; specially, (with the article in John) the Divine Expression (i.e. Christ)", kjv: "account, cause, communication, X concerning, doctrine, fame, X have to do, intent, matter, mouth, preaching, question, reason, + reckon, remove, say(-ing), shew, X speaker, speech, talk, thing, + none of these things move me, tidings, treatise, utterance, word, work" },
      { id: 5, orig: "καὶ", bsb: "and", gk: 5, en: 5, translit: "kai", parse: "Conj", strong: "G2532", gloss: "and", lemma: "καί", def: "and, also, even, so then, too, etc.; often used in connection (or composition) with other particles or small words", kjv: "and, also, both, but, even, for, if, or, so, that, then, therefore, when, yet" },
      { id: 6, orig: "ὁ", bsb: "the", gk: 6, en: 6, translit: "ho", parse: "Art-NMS", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 7, orig: "Λόγος", bsb: "Word", gk: 7, en: 7, translit: "Logos", parse: "N-NMS", strong: "G3056", gloss: "word", lemma: "λόγος", def: "something said (including the thought); by implication, a topic (subject of discourse), also reasoning (the mental faculty) or motive; by extension, a computation; specially, (with the article in John) the Divine Expression (i.e. Christ)", kjv: "account, cause, communication, X concerning, doctrine, fame, X have to do, intent, matter, mouth, preaching, question, reason, + reckon, remove, say(-ing), shew, X speaker, speech, talk, thing, + none of these things move me, tidings, treatise, utterance, word, work" },
      { id: 8, orig: "ἦν", bsb: "was", gk: 8, en: 8, translit: "ēn", parse: "V-IIA-3S", strong: "G1510", gloss: "is", lemma: "εἰμί", def: "I exist (used only when emphatic)", kjv: "am, have been, X it is I, was" },
      { id: 9, orig: "πρὸς", bsb: "with", gk: 9, en: 9, translit: "pros", parse: "Prep", strong: "G4314", gloss: "to", lemma: "πρός", def: "a preposition of direction; forward to, i.e. toward (with the genitive case, the side of, i.e. pertaining to; with the dative case, by the side of, i.e. near to; usually with the accusative case, the place, time, occasion, or respect, which is the destination of the relation, i.e. whither or for which it is predicated)", kjv: "about, according to , against, among, at, because of, before, between, (where-)by, for, X at thy house, in, for intent, nigh unto, of, which pertain to, that, to (the end that), X together, to (you) -ward, unto, with(-in)" },
      { id: 10, orig: "τὸν", bsb: "", gk: 10, en: 10, translit: "ton", parse: "Art-AMS", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 11, orig: "Θεόν", bsb: "God", gk: 11, en: 11, translit: "Theon", parse: "N-AMS", strong: "G2316", gloss: "God", lemma: "θεός", def: "figuratively, a magistrate; by Hebraism, very", kjv: "X exceeding, God, god(-ly, -ward)" },
      { id: 12, orig: "καὶ", bsb: "and", gk: 12, en: 12, translit: "kai", parse: "Conj", strong: "G2532", gloss: "and", lemma: "καί", def: "and, also, even, so then, too, etc.; often used in connection (or composition) with other particles or small words", kjv: "and, also, both, but, even, for, if, or, so, that, then, therefore, when, yet" },
      { id: 13, orig: "ὁ", bsb: "the", gk: 15, en: 13, translit: "ho", parse: "Art-NMS", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 14, orig: "Λόγος", bsb: "Word", gk: 16, en: 14, translit: "Logos", parse: "N-NMS", strong: "G3056", gloss: "word", lemma: "λόγος", def: "something said (including the thought); by implication, a topic (subject of discourse), also reasoning (the mental faculty) or motive; by extension, a computation; specially, (with the article in John) the Divine Expression (i.e. Christ)", kjv: "account, cause, communication, X concerning, doctrine, fame, X have to do, intent, matter, mouth, preaching, question, reason, + reckon, remove, say(-ing), shew, X speaker, speech, talk, thing, + none of these things move me, tidings, treatise, utterance, word, work" },
      { id: 15, orig: "ἦν", bsb: "was", gk: 14, en: 15, translit: "ēn", parse: "V-IIA-3S", strong: "G1510", gloss: "is", lemma: "εἰμί", def: "I exist (used only when emphatic)", kjv: "am, have been, X it is I, was" },
      { id: 16, orig: "Θεὸς", bsb: "God", gk: 13, en: 16, translit: "Theos", parse: "N-NMS", strong: "G2316", gloss: "God", lemma: "θεός", def: "figuratively, a magistrate; by Hebraism, very", kjv: "X exceeding, God, god(-ly, -ward)" },
    ],
    versions: [
      { abbr: "KJV", text: "In the beginning was the Word, and the Word was with God, and the Word was God." },
      { abbr: "WEB", text: "In the beginning was the Word, and the Word was with God, and the Word was God." },
      { abbr: "ASV", text: "In the beginning was the Word, and the Word was with God, and the Word was God." },
      { abbr: "GNV", text: "In the beginning was that Word, and that Word was with God, and that Word was God." },
      { abbr: "YLT", text: "In the beginning was the Word, and the Word was with God, and the Word was God;" },
      { abbr: "DBY", text: "In [the] beginning was the Word, and the Word was with God, and the Word was God." },
    ],
  },
  2: {
    bsb: "He was with God in the beginning.",
    notes: [
      {
        range: "1:1-18",
        text: "The beginning of this prologue (John 1:1-5) might be a poem or hymn sung by the earliest Christians. The prologue’s themes—the coming of the light into the world, the rejection of the light, and its gift of new life to believers—prepares readers for the story that follows.",
      },
    ],
    refs: [
    ],
    refCount: 0,
    words: [
      { id: 0, orig: "Οὗτος", bsb: "He", gk: 0, en: 0, translit: "Houtos", parse: "DPro-NMS", strong: "G3778", gloss: "this", lemma: "οὗτος", def: "the he (she or it), i.e. this or that (often with article repeated)", kjv: "he (it was that), hereof, it, she, such as, the same, these, they, this (man, same, woman), which, who" },
      { id: 1, orig: "ἦν", bsb: "was", gk: 1, en: 1, translit: "ēn", parse: "V-IIA-3S", strong: "G1510", gloss: "is", lemma: "εἰμί", def: "I exist (used only when emphatic)", kjv: "am, have been, X it is I, was" },
      { id: 2, orig: "πρὸς", bsb: "with", gk: 4, en: 2, translit: "pros", parse: "Prep", strong: "G4314", gloss: "to", lemma: "πρός", def: "a preposition of direction; forward to, i.e. toward (with the genitive case, the side of, i.e. pertaining to; with the dative case, by the side of, i.e. near to; usually with the accusative case, the place, time, occasion, or respect, which is the destination of the relation, i.e. whither or for which it is predicated)", kjv: "about, according to , against, among, at, because of, before, between, (where-)by, for, X at thy house, in, for intent, nigh unto, of, which pertain to, that, to (the end that), X together, to (you) -ward, unto, with(-in)" },
      { id: 3, orig: "τὸν", bsb: "", gk: 5, en: 3, translit: "ton", parse: "Art-AMS", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 4, orig: "Θεόν", bsb: "God", gk: 6, en: 4, translit: "Theon", parse: "N-AMS", strong: "G2316", gloss: "God", lemma: "θεός", def: "figuratively, a magistrate; by Hebraism, very", kjv: "X exceeding, God, god(-ly, -ward)" },
      { id: 5, orig: "ἐν", bsb: "in", gk: 2, en: 5, translit: "en", parse: "Prep", strong: "G1722", gloss: "in", lemma: "ἐν", def: "\"in,\" at, (up-)on, by, etc.", kjv: "about, after, against, + almost, X altogether, among, X as, at, before, between, (here-)by (+ all means), for (… sake of), + give self wholly to, (here-)in(-to, -wardly), X mightily, (because) of, (up-)on, (open-)ly, X outwardly, one, X quickly, X shortly, (speedi-)ly, X that, X there(-in, -on), through(-out), (un-)to(-ward), under, when, where(-with), while, with(-in)" },
      { id: 6, orig: "ἀρχῇ", bsb: "the beginning", gk: 3, en: 6, translit: "archē", parse: "N-DFS", strong: "G746", gloss: "beginning", lemma: "ἀρχή", def: "(properly abstract) a commencement, or (concretely) chief (in various applications of order, time, place, or rank)", kjv: "beginning, corner, (at the, the) first (estate), magistrate, power, principality, principle, rule" },
    ],
    versions: [
      { abbr: "KJV", text: "The same was in the beginning with God." },
      { abbr: "WEB", text: "The same was in the beginning with God." },
      { abbr: "ASV", text: "The same was in the beginning with God." },
      { abbr: "GNV", text: "This same was in the beginning with God." },
      { abbr: "YLT", text: "this one was in the beginning with God;" },
      { abbr: "DBY", text: "He was in the beginning with God." },
    ],
  },
  3: {
    bsb: "Through Him all things were made, and without Him nothing was made that has been made.",
    notes: [
      {
        range: "1:3",
        text: "The logos is God (John 1:1-2); all that God does, the logos likewise does. Throughout his Gospel, John rightly viewed Jesus’ actions as divine activity.",
      },
      {
        range: "1:1-18",
        text: "The beginning of this prologue (John 1:1-5) might be a poem or hymn sung by the earliest Christians. The prologue’s themes—the coming of the light into the world, the rejection of the light, and its gift of new life to believers—prepares readers for the story that follows.",
      },
    ],
    refs: [
      {
        label: "Colossians 1:16-17",
        text: "For in Him all things were created, things in heaven and on earth, visible and invisible, whether thrones or dominions or rulers or authorities. All things were created through Him and for Him.",
      },
      {
        label: "1 Corinthians 8:6",
        text: "yet for us there is but one God, the Father, from whom all things came and for whom we exist. And there is but one Lord, Jesus Christ, through whom all things came and through whom we exist.",
      },
      {
        label: "Revelation 4:11",
        text: "“Worthy are You, our Lord and God, to receive glory and honor and power, for You created all things; by Your will they exist and were created.”",
      },
    ],
    refCount: 12,
    words: [
      { id: 0, orig: "δι’", bsb: "Through", gk: 1, en: 0, translit: "di’", parse: "Prep", strong: "G1223", gloss: "through", lemma: "διά", def: "through (in very wide applications, local, causal, or occasional)", kjv: "after, always, among, at, to avoid, because of (that), briefly, by, for (cause) … fore, from, in, by occasion of, of, by reason of, for sake, that, thereby, therefore, X though, through(-out), to, wherefore, with (-in)" },
      { id: 1, orig: "αὐτοῦ", bsb: "Him", gk: 2, en: 1, translit: "autou", parse: "PPro-GM3S", strong: "G846", gloss: "Him", lemma: "αὐτός", def: "the reflexive pronoun self, used (alone or in the comparative G1438 (ἑαυτοῦ)) of the third person , and (with the proper personal pronoun) of the other persons", kjv: "her, it(-self), one, the other, (mine) own, said, (self-), the) same, ((him-, my-, thy- )self, (your-)selves, she, that, their(-s), them(-selves), there(-at, - by, -in, -into, -of, -on, -with), they, (these) things, this (man), those, together, very, which" },
      { id: 2, orig: "πάντα", bsb: "all things", gk: 0, en: 2, translit: "panta", parse: "Adj-NNP", strong: "G3956", gloss: "all", lemma: "πᾶς", def: "all, any, every, the whole", kjv: "all (manner of, means), alway(-s), any (one), X daily, + ever, every (one, way), as many as, + no(-thing), X thoroughly, whatsoever, whole, whosoever" },
      { id: 3, orig: "ἐγένετο", bsb: "were made", gk: 3, en: 3, translit: "egeneto", parse: "V-AIM-3S", strong: "G1096", gloss: "it came to pass", lemma: "γίνομαι", def: "to cause to be (\"gen\"-erate), i.e. (reflexively) to become (come into being), used with great latitude (literal, figurative, intensive, etc.)", kjv: "arise, be assembled, be(-come, -fall, -have self), be brought (to pass), (be) come (to pass), continue, be divided, draw, be ended, fall, be finished, follow, be found, be fulfilled, + God forbid, grow, happen, have, be kept, be made, be married, be ordained to be, partake, pass, be performed, be published, require, seem, be showed, X soon as it was, sound, be taken, be turned, use, wax, will, would, be wrought" },
      { id: 4, orig: "καὶ", bsb: "and", gk: 4, en: 4, translit: "kai", parse: "Conj", strong: "G2532", gloss: "and", lemma: "καί", def: "and, also, even, so then, too, etc.; often used in connection (or composition) with other particles or small words", kjv: "and, also, both, but, even, for, if, or, so, that, then, therefore, when, yet" },
      { id: 5, orig: "χωρὶς", bsb: "without", gk: 5, en: 5, translit: "chōris", parse: "Prep", strong: "G5565", gloss: "apart from", lemma: "χωρίς", def: "at a space, i.e. separately or apart from (often as preposition)", kjv: "beside, by itself, without" },
      { id: 6, orig: "αὐτοῦ", bsb: "Him", gk: 6, en: 6, translit: "autou", parse: "PPro-GM3S", strong: "G846", gloss: "Him", lemma: "αὐτός", def: "the reflexive pronoun self, used (alone or in the comparative G1438 (ἑαυτοῦ)) of the third person , and (with the proper personal pronoun) of the other persons", kjv: "her, it(-self), one, the other, (mine) own, said, (self-), the) same, ((him-, my-, thy- )self, (your-)selves, she, that, their(-s), them(-selves), there(-at, - by, -in, -into, -of, -on, -with), they, (these) things, this (man), those, together, very, which" },
      { id: 7, orig: "οὐδὲ", bsb: "nothing", gk: 8, en: 7, translit: "oude", parse: "Adv", strong: "G3761", gloss: "nor", lemma: "οὐδέ", def: "not however, i.e. neither, nor, not even", kjv: "neither (indeed), never, no (more, nor, not), nor (yet), (also, even, then) not (even, so much as), + nothing, so much as" },
      { id: 8, orig: "ἕν", bsb: "", gk: 9, en: 8, translit: "hen", parse: "Adj-NNS", strong: "G1520", gloss: "one", lemma: "εἷς", def: "one", kjv: "a(-n, -ny, certain), + abundantly, man, one (another), only, other, some" },
      { id: 9, orig: "ἐγένετο", bsb: "was made", gk: 7, en: 9, translit: "egeneto", parse: "V-AIM-3S", strong: "G1096", gloss: "it came to pass", lemma: "γίνομαι", def: "to cause to be (\"gen\"-erate), i.e. (reflexively) to become (come into being), used with great latitude (literal, figurative, intensive, etc.)", kjv: "arise, be assembled, be(-come, -fall, -have self), be brought (to pass), (be) come (to pass), continue, be divided, draw, be ended, fall, be finished, follow, be found, be fulfilled, + God forbid, grow, happen, have, be kept, be made, be married, be ordained to be, partake, pass, be performed, be published, require, seem, be showed, X soon as it was, sound, be taken, be turned, use, wax, will, would, be wrought" },
      { id: 10, orig: "ὃ", bsb: "that", gk: 10, en: 10, translit: "ho", parse: "RelPro-NNS", strong: "G3739", gloss: "which", lemma: "ὅς", def: "the relatively (sometimes demonstrative) pronoun, who, which, what, that", kjv: "one, (an-, the) other, some, that, what, which, who(-m, -se), etc" },
      { id: 11, orig: "γέγονεν", bsb: "has been made", gk: 11, en: 11, translit: "gegonen", parse: "V-RIA-3S", strong: "G1096", gloss: "it came to pass", lemma: "γίνομαι", def: "to cause to be (\"gen\"-erate), i.e. (reflexively) to become (come into being), used with great latitude (literal, figurative, intensive, etc.)", kjv: "arise, be assembled, be(-come, -fall, -have self), be brought (to pass), (be) come (to pass), continue, be divided, draw, be ended, fall, be finished, follow, be found, be fulfilled, + God forbid, grow, happen, have, be kept, be made, be married, be ordained to be, partake, pass, be performed, be published, require, seem, be showed, X soon as it was, sound, be taken, be turned, use, wax, will, would, be wrought" },
    ],
    versions: [
      { abbr: "KJV", text: "All things were made by him; and without him was not any thing made that was made." },
      { abbr: "WEB", text: "All things were made through him. Without him, nothing was made that has been made." },
      { abbr: "ASV", text: "All things were made through him; and without him was not anything made that hath been made." },
      { abbr: "GNV", text: "All things were made by it, and without it was made nothing that was made." },
      { abbr: "YLT", text: "all things through him did happen, and without him happened not even one thing that hath happened." },
      { abbr: "DBY", text: "All things received being through him, and without him not one [thing] received being which has received being." },
    ],
  },
  4: {
    bsb: "In Him was life, and that life was the light of men.",
    notes: [
      {
        range: "1:4",
        text: "The Word gave life: Life was God’s original gift to his creatures (Genesis 1:20-28; Genesis 2:7). Now the logos would give these creatures the possibility of new life through rebirth (John 1:13). • As one of his first creative acts, God brought light (Genesis 1:3). Now, in the re-creation of humanity through Jesus Christ, God offered light and life anew. Light is a key theme in John’s Gospel.",
      },
      {
        range: "1:4-5",
        text: "God created light and dispelled the darkness (Genesis 1:2-5). The darkness resists God (John 3:19-21; John 12:35; Matthew 6:23; Acts 26:17-18; Ephesians 4:17-19; Ephesians 5:7-14; 2 Pet 1:19; 1 Jn 1:5-7; 2:9-11).",
      },
    ],
    refs: [
      {
        label: "John 8:12",
        text: "Once again, Jesus spoke to the people and said, “I am the light of the world. Whoever follows Me will never walk in the darkness, but will have the light of life.”",
      },
      {
        label: "John 12:46",
        text: "I have come into the world as a light, so that no one who believes in Me should remain in darkness.",
      },
      {
        label: "John 5:26",
        text: "For as the Father has life in Himself, so also He has granted the Son to have life in Himself.",
      },
    ],
    refCount: 12,
    words: [
      { id: 0, orig: "ἐν", bsb: "In", gk: 0, en: 0, translit: "en", parse: "Prep", strong: "G1722", gloss: "in", lemma: "ἐν", def: "\"in,\" at, (up-)on, by, etc.", kjv: "about, after, against, + almost, X altogether, among, X as, at, before, between, (here-)by (+ all means), for (… sake of), + give self wholly to, (here-)in(-to, -wardly), X mightily, (because) of, (up-)on, (open-)ly, X outwardly, one, X quickly, X shortly, (speedi-)ly, X that, X there(-in, -on), through(-out), (un-)to(-ward), under, when, where(-with), while, with(-in)" },
      { id: 1, orig: "αὐτῷ", bsb: "Him", gk: 1, en: 1, translit: "autō", parse: "PPro-DM3S", strong: "G846", gloss: "Him", lemma: "αὐτός", def: "the reflexive pronoun self, used (alone or in the comparative G1438 (ἑαυτοῦ)) of the third person , and (with the proper personal pronoun) of the other persons", kjv: "her, it(-self), one, the other, (mine) own, said, (self-), the) same, ((him-, my-, thy- )self, (your-)selves, she, that, their(-s), them(-selves), there(-at, - by, -in, -into, -of, -on, -with), they, (these) things, this (man), those, together, very, which" },
      { id: 2, orig: "ἦν", bsb: "was", gk: 3, en: 2, translit: "ēn", parse: "V-IIA-3S", strong: "G1510", gloss: "is", lemma: "εἰμί", def: "I exist (used only when emphatic)", kjv: "am, have been, X it is I, was" },
      { id: 3, orig: "ζωὴ", bsb: "life", gk: 2, en: 3, translit: "zōē", parse: "N-NFS", strong: "G2222", gloss: "life", lemma: "ζωή", def: "life (literally or figuratively)", kjv: "life(-time)" },
      { id: 4, orig: "καὶ", bsb: "and", gk: 4, en: 4, translit: "kai", parse: "Conj", strong: "G2532", gloss: "and", lemma: "καί", def: "and, also, even, so then, too, etc.; often used in connection (or composition) with other particles or small words", kjv: "and, also, both, but, even, for, if, or, so, that, then, therefore, when, yet" },
      { id: 5, orig: "ἡ", bsb: "that", gk: 5, en: 5, translit: "hē", parse: "Art-NFS", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 6, orig: "ζωὴ", bsb: "life", gk: 6, en: 6, translit: "zōē", parse: "N-NFS", strong: "G2222", gloss: "life", lemma: "ζωή", def: "life (literally or figuratively)", kjv: "life(-time)" },
      { id: 7, orig: "ἦν", bsb: "was", gk: 7, en: 7, translit: "ēn", parse: "V-IIA-3S", strong: "G1510", gloss: "is", lemma: "εἰμί", def: "I exist (used only when emphatic)", kjv: "am, have been, X it is I, was" },
      { id: 8, orig: "τὸ", bsb: "the", gk: 8, en: 8, translit: "to", parse: "Art-NNS", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 9, orig: "φῶς", bsb: "light", gk: 9, en: 9, translit: "phōs", parse: "N-NNS", strong: "G5457", gloss: "light", lemma: "φῶς", def: "compare G5316 (φαίνω), G5346 (φημί)); luminousness (in the widest application, natural or artificial, abstract or concrete, literal or figurative)", kjv: "fire, light" },
      { id: 10, orig: "τῶν", bsb: "", gk: 10, en: 10, translit: "tōn", parse: "Art-GMP", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 11, orig: "ἀνθρώπων", bsb: "of men", gk: 11, en: 11, translit: "anthrōpōn", parse: "N-GMP", strong: "G444", gloss: "man", lemma: "ἄνθρωπος", def: "from G3700 (ὀπτάνομαι)); man-faced, i.e. a human being", kjv: "certain, man" },
    ],
    versions: [
      { abbr: "KJV", text: "In him was life; and the life was the light of men." },
      { abbr: "WEB", text: "In him was life, and the life was the light of men." },
      { abbr: "ASV", text: "In him was life; and the life was the light of men." },
      { abbr: "GNV", text: "In it was life, and that life was the light of men." },
      { abbr: "YLT", text: "In him was life, and the life was the light of men," },
      { abbr: "DBY", text: "In him was life, and the life was the light of men." },
    ],
  },
  5: {
    bsb: "The Light shines in the darkness, and the darkness has not overcome it.",
    notes: [
      {
        range: "1:5",
        text: "the darkness can never extinguish it: Or the darkness has not understood it; literally the darkness cannot grasp it. The Greek word katalambanō (“grasp”) can mean either “understand” or “be hostile”; in John’s Gospel, it means hostility. The darkness would try to destroy Jesus (the light), but it would fail. The light would successfully bring salvation to the world.",
      },
      {
        range: "1:4-5",
        text: "God created light and dispelled the darkness (Genesis 1:2-5). The darkness resists God (John 3:19-21; John 12:35; Matthew 6:23; Acts 26:17-18; Ephesians 4:17-19; Ephesians 5:7-14; 2 Pet 1:19; 1 Jn 1:5-7; 2:9-11).",
      },
    ],
    refs: [
      {
        label: "John 3:19-20",
        text: "And this is the verdict: The Light has come into the world, but men loved the darkness rather than the Light because their deeds were evil.",
      },
      {
        label: "John 12:36-40",
        text: "While you have the Light, believe in the Light, so that you may become sons of light.” After Jesus had spoken these things, He went away and was hidden from them.",
      },
      {
        label: "1 Corinthians 2:14",
        text: "The natural man does not accept the things that come from the Spirit of God. For they are foolishness to him, and he cannot understand them, because they are spiritually discerned.",
      },
    ],
    refCount: 8,
    words: [
      { id: 0, orig: "καὶ", bsb: "", gk: 0, en: 0, translit: "kai", parse: "Conj", strong: "G2532", gloss: "and", lemma: "καί", def: "and, also, even, so then, too, etc.; often used in connection (or composition) with other particles or small words", kjv: "and, also, both, but, even, for, if, or, so, that, then, therefore, when, yet" },
      { id: 1, orig: "τὸ", bsb: "The", gk: 1, en: 1, translit: "to", parse: "Art-NNS", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 2, orig: "φῶς", bsb: "Light", gk: 2, en: 2, translit: "phōs", parse: "N-NNS", strong: "G5457", gloss: "light", lemma: "φῶς", def: "compare G5316 (φαίνω), G5346 (φημί)); luminousness (in the widest application, natural or artificial, abstract or concrete, literal or figurative)", kjv: "fire, light" },
      { id: 3, orig: "φαίνει", bsb: "shines", gk: 6, en: 3, translit: "phainei", parse: "V-PIA-3S", strong: "G5316", gloss: "shines", lemma: "φαίνω", def: "to lighten (shine), i.e. show (transitive or intransitive, literal or figurative)", kjv: "appear, seem, be seen, shine, X think" },
      { id: 4, orig: "ἐν", bsb: "in", gk: 3, en: 4, translit: "en", parse: "Prep", strong: "G1722", gloss: "in", lemma: "ἐν", def: "\"in,\" at, (up-)on, by, etc.", kjv: "about, after, against, + almost, X altogether, among, X as, at, before, between, (here-)by (+ all means), for (… sake of), + give self wholly to, (here-)in(-to, -wardly), X mightily, (because) of, (up-)on, (open-)ly, X outwardly, one, X quickly, X shortly, (speedi-)ly, X that, X there(-in, -on), through(-out), (un-)to(-ward), under, when, where(-with), while, with(-in)" },
      { id: 5, orig: "τῇ", bsb: "the", gk: 4, en: 5, translit: "tē", parse: "Art-DFS", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 6, orig: "σκοτίᾳ", bsb: "darkness", gk: 5, en: 6, translit: "skotia", parse: "N-DFS", strong: "G4653", gloss: "darkness", lemma: "σκοτία", def: "dimness, obscurity (literally or figuratively)", kjv: "dark(-ness)" },
      { id: 7, orig: "καὶ", bsb: "and", gk: 7, en: 7, translit: "kai", parse: "Conj", strong: "G2532", gloss: "and", lemma: "καί", def: "and, also, even, so then, too, etc.; often used in connection (or composition) with other particles or small words", kjv: "and, also, both, but, even, for, if, or, so, that, then, therefore, when, yet" },
      { id: 8, orig: "ἡ", bsb: "the", gk: 8, en: 8, translit: "hē", parse: "Art-NFS", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 9, orig: "σκοτία", bsb: "darkness", gk: 9, en: 9, translit: "skotia", parse: "N-NFS", strong: "G4653", gloss: "darkness", lemma: "σκοτία", def: "dimness, obscurity (literally or figuratively)", kjv: "dark(-ness)" },
      { id: 10, orig: "οὐ", bsb: "has not", gk: 11, en: 10, translit: "ou", parse: "Adv", strong: "G3756", gloss: "not", lemma: "οὐ", def: "the absolute negative (compare G3361 (μή)) adverb; no or not", kjv: "+ long, nay, neither, never, no (X man), none, (can-)not, + nothing, + special, un(-worthy), when, + without, + yet but" },
      { id: 11, orig: "κατέλαβεν", bsb: "overcome", gk: 12, en: 11, translit: "katelaben", parse: "V-AIA-3S", strong: "G2638", gloss: "may grasp", lemma: "καταλαμβάνω", def: "to take eagerly, i.e. seize, possess, etc. (literally or figuratively)", kjv: "apprehend, attain, come upon, comprehend, find, obtain, perceive, (over-)take" },
      { id: 12, orig: "αὐτὸ", bsb: "it", gk: 10, en: 12, translit: "auto", parse: "PPro-AN3S", strong: "G846", gloss: "Him", lemma: "αὐτός", def: "the reflexive pronoun self, used (alone or in the comparative G1438 (ἑαυτοῦ)) of the third person , and (with the proper personal pronoun) of the other persons", kjv: "her, it(-self), one, the other, (mine) own, said, (self-), the) same, ((him-, my-, thy- )self, (your-)selves, she, that, their(-s), them(-selves), there(-at, - by, -in, -into, -of, -on, -with), they, (these) things, this (man), those, together, very, which" },
    ],
    versions: [
      { abbr: "KJV", text: "And the light shineth in darkness; and the darkness comprehended it not." },
      { abbr: "WEB", text: "The light shines in the darkness, and the darkness hasn’t overcome it." },
      { abbr: "ASV", text: "And the light shineth in the darkness; and the darkness apprehended it not." },
      { abbr: "GNV", text: "And that light shineth in the darkenesse, and the darkenesse comprehended it not." },
      { abbr: "YLT", text: "and the light in the darkness did shine, and the darkness did not perceive it." },
      { abbr: "DBY", text: "And the light appears in darkness, and the darkness apprehended it not." },
    ],
  },
  6: {
    bsb: "There came a man who was sent from God. His name was John.",
    notes: [
      {
        range: "1:6-9",
        text: "God sent a man, John the Baptist, to herald Jesus’ coming and to prepare God’s people to receive Jesus as God’s Son and Messiah (see John 1:19-37; Luke 1:5-25, Luke 1:57-80; Luke 3:1-22; see also Isaiah 40:3; Malachi 4:5-6).",
      },
      {
        range: "1:1-18",
        text: "The beginning of this prologue (John 1:1-5) might be a poem or hymn sung by the earliest Christians. The prologue’s themes—the coming of the light into the world, the rejection of the light, and its gift of new life to believers—prepares readers for the story that follows.",
      },
    ],
    refs: [
      { label: "Malachi 3:1", text: "“Behold, I will send My messenger, who will prepare the way before Me. Then the Lord whom you seek will suddenly come to His temple—the Messenger of the covenant, in whom you delight—see, He is coming,” says the LORD of Hosts." },
      { label: "John 3:28", text: "You yourselves can testify that I said, ‘I am not the Christ, but am sent ahead of Him.’" },
      { label: "Isaiah 40:3-5", text: "A voice of one calling: “Prepare the way for the LORD in the wilderness; make a straight highway for our God in the desert." },
    ],
    refCount: 12,
    words: [
      { id: 0, orig: "Ἐγένετο", bsb: "There came", gk: 0, en: 0, translit: "Egeneto", parse: "V-AIM-3S", strong: "G1096", gloss: "it came to pass", lemma: "γίνομαι", def: "to cause to be (\"gen\"-erate), i.e. (reflexively) to become (come into being), used with great latitude (literal, figurative, intensive, etc.)", kjv: "arise, be assembled, be(-come, -fall, -have self), be brought (to pass), (be) come (to pass), continue, be divided, draw, be ended, fall, be finished, follow, be found, be fulfilled, + God forbid, grow, happen, have, be kept, be made, be married, be ordained to be, partake, pass, be performed, be published, require, seem, be showed, X soon as it was, sound, be taken, be turned, use, wax, will, would, be wrought" },
      { id: 1, orig: "ἄνθρωπος", bsb: "a man", gk: 1, en: 1, translit: "anthrōpos", parse: "N-NMS", strong: "G444", gloss: "man", lemma: "ἄνθρωπος", def: "from G3700 (ὀπτάνομαι)); man-faced, i.e. a human being", kjv: "certain, man" },
      { id: 2, orig: "ἀπεσταλμένος", bsb: "who was sent", gk: 2, en: 2, translit: "apestalmenos", parse: "V-RPM/P-NMS", strong: "G649", gloss: "sent", lemma: "ἀποστέλλω", def: "set apart, i.e. (by implication) to send out (properly, on a mission) literally or figuratively", kjv: "put in, send (away, forth, out), set (at liberty)" },
      { id: 3, orig: "παρὰ", bsb: "from", gk: 3, en: 3, translit: "para", parse: "Prep", strong: "G3844", gloss: "from", lemma: "παρά", def: "properly, near; i.e. (with genitive case) from beside (literally or figuratively), (with dative case) at (or in) the vicinity of (objectively or subjectively), (with accusative case) to the proximity with (local (especially beyond or opposed to) or causal (on account of)", kjv: "above, against, among, at, before, by, contrary to, X friend, from, + give (such things as they), + that (she) had, X his, in, more than, nigh unto, (out) of, past, save, side…by, in the sight of, than, (there-)fore, with" },
      { id: 4, orig: "Θεοῦ", bsb: "God", gk: 4, en: 4, translit: "Theou", parse: "N-GMS", strong: "G2316", gloss: "God", lemma: "θεός", def: "figuratively, a magistrate; by Hebraism, very", kjv: "X exceeding, God, god(-ly, -ward)" },
      { id: 5, orig: "αὐτῷ", bsb: "His", gk: 6, en: 5, translit: "autō", parse: "PPro-DM3S", strong: "G846", gloss: "Him", lemma: "αὐτός", def: "the reflexive pronoun self, used (alone or in the comparative G1438 (ἑαυτοῦ)) of the third person , and (with the proper personal pronoun) of the other persons", kjv: "her, it(-self), one, the other, (mine) own, said, (self-), the) same, ((him-, my-, thy- )self, (your-)selves, she, that, their(-s), them(-selves), there(-at, - by, -in, -into, -of, -on, -with), they, (these) things, this (man), those, together, very, which" },
      { id: 6, orig: "ὄνομα", bsb: "name", gk: 5, en: 6, translit: "onoma", parse: "N-NNS", strong: "G3686", gloss: "name", lemma: "ὄνομα", def: "a \"name\" (literally or figuratively) (authority, character)", kjv: "called, (+ sur-)name(-d)" },
      { id: 7, orig: "Ἰωάννης", bsb: "was John", gk: 7, en: 7, translit: "Iōannēs", parse: "N-NMS", strong: "G2491", gloss: "John", lemma: "Ἰωάννης", def: "Joannes (i.e. Jochanan), the name of four Israelites", kjv: "John" },
    ],
    versions: [
      { abbr: "KJV", text: "There was a man sent from God, whose name was John." },
      { abbr: "WEB", text: "There came a man sent from God, whose name was John." },
      { abbr: "ASV", text: "There came a man, sent from God, whose name was John." },
      { abbr: "GNV", text: "There was a man sent from God, whose name was Iohn." },
      { abbr: "YLT", text: "There came a man — having been sent from God — whose name [is] John," },
      { abbr: "DBY", text: "There was a man sent from God, his name John." },
    ],
  },
  7: {
    bsb: "He came as a witness to testify about the Light, so that through him everyone might believe.",
    notes: [
      {
        range: "1:6-9",
        text: "God sent a man, John the Baptist, to herald Jesus’ coming and to prepare God’s people to receive Jesus as God’s Son and Messiah (see John 1:19-37; Luke 1:5-25, Luke 1:57-80; Luke 3:1-22; see also Isaiah 40:3; Malachi 4:5-6).",
      },
      {
        range: "1:1-18",
        text: "The beginning of this prologue (John 1:1-5) might be a poem or hymn sung by the earliest Christians. The prologue’s themes—the coming of the light into the world, the rejection of the light, and its gift of new life to believers—prepares readers for the story that follows.",
      },
    ],
    refs: [
      { label: "Acts 19:4", text: "Paul explained: “John’s baptism was a baptism of repentance. He told the people to believe in the One coming after him, that is, in Jesus.”" },
      { label: "John 1:32-34", text: "Then John testified, “I saw the Spirit descending from heaven like a dove and resting on Him." },
      { label: "John 1:36", text: "When he saw Jesus walking by, he said, “Look, the Lamb of God!”" },
    ],
    refCount: 12,
    words: [
      { id: 0, orig: "οὗτος", bsb: "He", gk: 0, en: 0, translit: "houtos", parse: "DPro-NMS", strong: "G3778", gloss: "this", lemma: "οὗτος", def: "the he (she or it), i.e. this or that (often with article repeated)", kjv: "he (it was that), hereof, it, she, such as, the same, these, they, this (man, same, woman), which, who" },
      { id: 1, orig: "ἦλθεν", bsb: "came", gk: 1, en: 1, translit: "ēlthen", parse: "V-AIA-3S", strong: "G2064", gloss: "having come", lemma: "ἔρχομαι", def: "to come or go (in a great variety of applications, literally and figuratively)", kjv: "accompany, appear, bring, come, enter, fall out, go, grow, X light, X next, pass, resort, be set" },
      { id: 2, orig: "εἰς", bsb: "as", gk: 2, en: 2, translit: "eis", parse: "Prep", strong: "G1519", gloss: "to", lemma: "εἰς", def: "to or into (indicating the point reached or entered), of place, time, or (figuratively) purpose (result, etc.); also in adverbial phrases", kjv: "(abundant-)ly, against, among, as, at, (back-)ward, before, by, concerning, + continual, + far more exceeding, for (intent, purpose), fore, + forth, in (among, at, unto, -so much that, -to), to the intent that, + of one mind, + never, of, (up-)on, + perish, + set at one again, (so) that, therefore(-unto), throughout, til, to (be, the end, -ward), (here-)until(-to), …ward, (where-)fore, with" },
      { id: 3, orig: "μαρτυρίαν", bsb: "a witness", gk: 3, en: 3, translit: "martyrian", parse: "N-AFS", strong: "G3141", gloss: "testimony", lemma: "μαρτυρία", def: "evidence given (judicially or genitive case)", kjv: "record, report, testimony, witness" },
      { id: 4, orig: "ἵνα", bsb: "to", gk: 4, en: 4, translit: "hina", parse: "Conj", strong: "G2443", gloss: "that", lemma: "ἵνα", def: "compare G3588 (ὁ)); in order that (denoting the purpose or the result)", kjv: "albeit, because, to the intent (that), lest, so as, (so) that, (for) to" },
      { id: 5, orig: "μαρτυρήσῃ", bsb: "testify", gk: 5, en: 5, translit: "martyrēsē", parse: "V-ASA-3S", strong: "G3140", gloss: "bear witness", lemma: "μαρτυρέω", def: "to be a witness, i.e. testify (literally or figuratively)", kjv: "charge, give (evidence), bear record, have (obtain, of) good (honest) report, be well reported of, testify, give (have) testimony, (be, bear, give, obtain) witness" },
      { id: 6, orig: "περὶ", bsb: "about", gk: 6, en: 6, translit: "peri", parse: "Prep", strong: "G4012", gloss: "concerning", lemma: "περί", def: "properly, through (all over), i.e. around; figuratively with respect to; used in various applications, of place, cause or time (with the genitive case denoting the subject or occasion or superlative point; with the accusative case the locality, circuit, matter, circumstance or general period)", kjv: "(there-)about, above, against, at, on behalf of, X and his company, which concern, (as) concerning, for, X how it will go with, ((there-, where-)) of, on, over, pertaining (to), for sake, X (e-)state, (as) touching, (where-)by (in), with" },
      { id: 7, orig: "τοῦ", bsb: "the", gk: 7, en: 7, translit: "tou", parse: "Art-GNS", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 8, orig: "φωτός", bsb: "Light", gk: 8, en: 8, translit: "phōtos", parse: "N-GNS", strong: "G5457", gloss: "light", lemma: "φῶς", def: "compare G5316 (φαίνω), G5346 (φημί)); luminousness (in the widest application, natural or artificial, abstract or concrete, literal or figurative)", kjv: "fire, light" },
      { id: 9, orig: "ἵνα", bsb: "so that", gk: 9, en: 9, translit: "hina", parse: "Conj", strong: "G2443", gloss: "that", lemma: "ἵνα", def: "compare G3588 (ὁ)); in order that (denoting the purpose or the result)", kjv: "albeit, because, to the intent (that), lest, so as, (so) that, (for) to" },
      { id: 10, orig: "δι’", bsb: "through", gk: 12, en: 10, translit: "di’", parse: "Prep", strong: "G1223", gloss: "through", lemma: "διά", def: "through (in very wide applications, local, causal, or occasional)", kjv: "after, always, among, at, to avoid, because of (that), briefly, by, for (cause) … fore, from, in, by occasion of, of, by reason of, for sake, that, thereby, therefore, X though, through(-out), to, wherefore, with (-in)" },
      { id: 11, orig: "αὐτοῦ", bsb: "him", gk: 13, en: 11, translit: "autou", parse: "PPro-GM3S", strong: "G846", gloss: "Him", lemma: "αὐτός", def: "the reflexive pronoun self, used (alone or in the comparative G1438 (ἑαυτοῦ)) of the third person , and (with the proper personal pronoun) of the other persons", kjv: "her, it(-self), one, the other, (mine) own, said, (self-), the) same, ((him-, my-, thy- )self, (your-)selves, she, that, their(-s), them(-selves), there(-at, - by, -in, -into, -of, -on, -with), they, (these) things, this (man), those, together, very, which" },
      { id: 12, orig: "πάντες", bsb: "everyone", gk: 10, en: 12, translit: "pantes", parse: "Adj-NMP", strong: "G3956", gloss: "all", lemma: "πᾶς", def: "all, any, every, the whole", kjv: "all (manner of, means), alway(-s), any (one), X daily, + ever, every (one, way), as many as, + no(-thing), X thoroughly, whatsoever, whole, whosoever" },
      { id: 13, orig: "πιστεύσωσιν", bsb: "might believe", gk: 11, en: 13, translit: "pisteusōsin", parse: "V-ASA-3P", strong: "G4100", gloss: "believing", lemma: "πιστεύω", def: "to have faith (in, upon, or with respect to, a person or thing), i.e. credit; by implication, to entrust (especially one's spiritual well-being to Christ)", kjv: "believe(-r), commit (to trust), put in trust with" },
    ],
    versions: [
      { abbr: "KJV", text: "The same came for a witness, to bear witness of the Light, that all men through him might believe." },
      { abbr: "WEB", text: "The same came as a witness, that he might testify about the light, that all might believe through him." },
      { abbr: "ASV", text: "The same came for witness, that he might bear witness of the light, that all might believe through him." },
      { abbr: "GNV", text: "This same came for a witnesse, to beare witnesse of that light, that all men through him might beleeue." },
      { abbr: "YLT", text: "this one came for testimony, that he might testify about the Light, that all might believe through him;" },
      { abbr: "DBY", text: "He came for witness, that he might witness concerning the light, that all might believe through him." },
    ],
  },
  8: {
    bsb: "He himself was not the Light, but he came to testify about the Light.",
    notes: [
      {
        range: "1:8",
        text: "Some Jews speculated that John the Baptist was the Messiah; some of his followers were even reluctant to follow Jesus (John 3:22-30). However, John the Baptist was not the light; his role was to announce Jesus (John 1:19-34).",
      },
      {
        range: "1:6-9",
        text: "God sent a man, John the Baptist, to herald Jesus’ coming and to prepare God’s people to receive Jesus as God’s Son and Messiah (see John 1:19-37; Luke 1:5-25, Luke 1:57-80; Luke 3:1-22; see also Isaiah 40:3; Malachi 4:5-6).",
      },
    ],
    refs: [
      { label: "John 1:20", text: "He did not refuse to confess, but openly declared, “I am not the Christ.”" },
      { label: "John 3:28", text: "You yourselves can testify that I said, ‘I am not the Christ, but am sent ahead of Him.’" },
      { label: "Acts 19:4", text: "Paul explained: “John’s baptism was a baptism of repentance. He told the people to believe in the One coming after him, that is, in Jesus.”" },
    ],
    refCount: 3,
    words: [
      { id: 0, orig: "ἐκεῖνος", bsb: "He himself", gk: 2, en: 0, translit: "ekeinos", parse: "DPro-NMS", strong: "G1565", gloss: "that", lemma: "ἐκεῖνος", def: "that one (or (neuter) thing); often intensified by the article prefixed", kjv: "he, it, the other (same), selfsame, that (same, very), X their, X them, they, this, those" },
      { id: 1, orig: "ἦν", bsb: "was", gk: 1, en: 1, translit: "ēn", parse: "V-IIA-3S", strong: "G1510", gloss: "is", lemma: "εἰμί", def: "I exist (used only when emphatic)", kjv: "am, have been, X it is I, was" },
      { id: 2, orig: "οὐκ", bsb: "not", gk: 0, en: 2, translit: "ouk", parse: "Adv", strong: "G3756", gloss: "not", lemma: "οὐ", def: "the absolute negative (compare G3361 (μή)) adverb; no or not", kjv: "+ long, nay, neither, never, no (X man), none, (can-)not, + nothing, + special, un(-worthy), when, + without, + yet but" },
      { id: 3, orig: "τὸ", bsb: "the", gk: 3, en: 3, translit: "to", parse: "Art-NNS", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 4, orig: "φῶς", bsb: "Light", gk: 4, en: 4, translit: "phōs", parse: "N-NNS", strong: "G5457", gloss: "light", lemma: "φῶς", def: "compare G5316 (φαίνω), G5346 (φημί)); luminousness (in the widest application, natural or artificial, abstract or concrete, literal or figurative)", kjv: "fire, light" },
      { id: 5, orig: "ἀλλ’", bsb: "but", gk: 5, en: 5, translit: "all’", parse: "Conj", strong: "G235", gloss: "but", lemma: "ἀλλά", def: "properly, other things, i.e. (adverbially) contrariwise (in many relations)", kjv: "and, but (even), howbeit, indeed, nay, nevertheless, no, notwithstanding, save, therefore, yea, yet" },
      { id: 6, orig: "ἵνα", bsb: "", gk: 6, en: 6, translit: "hina", parse: "Conj", strong: "G2443", gloss: "that", lemma: "ἵνα", def: "compare G3588 (ὁ)); in order that (denoting the purpose or the result)", kjv: "albeit, because, to the intent (that), lest, so as, (so) that, (for) to" },
      { id: 7, orig: "μαρτυρήσῃ", bsb: "he came to testify", gk: 7, en: 7, translit: "martyrēsē", parse: "V-ASA-3S", strong: "G3140", gloss: "bear witness", lemma: "μαρτυρέω", def: "to be a witness, i.e. testify (literally or figuratively)", kjv: "charge, give (evidence), bear record, have (obtain, of) good (honest) report, be well reported of, testify, give (have) testimony, (be, bear, give, obtain) witness" },
      { id: 8, orig: "περὶ", bsb: "about", gk: 8, en: 8, translit: "peri", parse: "Prep", strong: "G4012", gloss: "concerning", lemma: "περί", def: "properly, through (all over), i.e. around; figuratively with respect to; used in various applications, of place, cause or time (with the genitive case denoting the subject or occasion or superlative point; with the accusative case the locality, circuit, matter, circumstance or general period)", kjv: "(there-)about, above, against, at, on behalf of, X and his company, which concern, (as) concerning, for, X how it will go with, ((there-, where-)) of, on, over, pertaining (to), for sake, X (e-)state, (as) touching, (where-)by (in), with" },
      { id: 9, orig: "τοῦ", bsb: "the", gk: 9, en: 9, translit: "tou", parse: "Art-GNS", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 10, orig: "φωτός", bsb: "Light", gk: 10, en: 10, translit: "phōtos", parse: "N-GNS", strong: "G5457", gloss: "light", lemma: "φῶς", def: "compare G5316 (φαίνω), G5346 (φημί)); luminousness (in the widest application, natural or artificial, abstract or concrete, literal or figurative)", kjv: "fire, light" },
    ],
    versions: [
      { abbr: "KJV", text: "He was not that Light, but was sent to bear witness of that Light." },
      { abbr: "WEB", text: "He was not the light, but was sent that he might testify about the light." },
      { abbr: "ASV", text: "He was not the light, but came that he might bear witness of the light." },
      { abbr: "GNV", text: "He was not that light, but was sent to beare witnesse of that light." },
      { abbr: "YLT", text: "that one was not the Light, but — that he might testify about the Light." },
      { abbr: "DBY", text: "He was not the light, but that he might witness concerning the light." },
    ],
  },
  9: {
    bsb: "The true Light, who gives light to everyone, was coming into the world.",
    notes: [
      {
        range: "1:6-9",
        text: "God sent a man, John the Baptist, to herald Jesus’ coming and to prepare God’s people to receive Jesus as God’s Son and Messiah (see John 1:19-37; Luke 1:5-25, Luke 1:57-80; Luke 3:1-22; see also Isaiah 40:3; Malachi 4:5-6).",
      },
      {
        range: "1:1-18",
        text: "The beginning of this prologue (John 1:1-5) might be a poem or hymn sung by the earliest Christians. The prologue’s themes—the coming of the light into the world, the rejection of the light, and its gift of new life to believers—prepares readers for the story that follows.",
      },
    ],
    refs: [
      { label: "John 12:46", text: "I have come into the world as a light, so that no one who believes in Me should remain in darkness." },
      { label: "John 1:4", text: "In Him was life, and that life was the light of men." },
      { label: "1 John 2:8", text: "Then again, I am also writing to you a new commandment, which is true in Him and also in you. For the darkness is fading and the true light is already shining." },
    ],
    refCount: 12,
    words: [
      { id: 0, orig: "τὸ", bsb: "The", gk: 1, en: 0, translit: "to", parse: "Art-NNS", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 1, orig: "τὸ", bsb: "", gk: 3, en: 1, translit: "to", parse: "Art-NNS", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 2, orig: "ἀληθινὸν", bsb: "true", gk: 4, en: 2, translit: "alēthinon", parse: "Adj-NNS", strong: "G228", gloss: "true", lemma: "ἀληθινός", def: "truthful", kjv: "true" },
      { id: 3, orig: "φῶς", bsb: "Light", gk: 2, en: 3, translit: "phōs", parse: "N-NNS", strong: "G5457", gloss: "light", lemma: "φῶς", def: "compare G5316 (φαίνω), G5346 (φημί)); luminousness (in the widest application, natural or artificial, abstract or concrete, literal or figurative)", kjv: "fire, light" },
      { id: 4, orig: "ὃ", bsb: "who", gk: 5, en: 4, translit: "ho", parse: "RelPro-NNS", strong: "G3739", gloss: "which", lemma: "ὅς", def: "the relatively (sometimes demonstrative) pronoun, who, which, what, that", kjv: "one, (an-, the) other, some, that, what, which, who(-m, -se), etc" },
      { id: 5, orig: "φωτίζει", bsb: "gives light to", gk: 6, en: 5, translit: "phōtizei", parse: "V-PIA-3S", strong: "G5461", gloss: "enlightened", lemma: "φωτίζω", def: "to shed rays, i.e. to shine or (transitively) to brighten up (literally or figuratively)", kjv: "enlighten, illuminate, (bring to, give) light, make to see" },
      { id: 6, orig: "πάντα", bsb: "everyone", gk: 7, en: 6, translit: "panta", parse: "Adj-AMS", strong: "G3956", gloss: "all", lemma: "πᾶς", def: "all, any, every, the whole", kjv: "all (manner of, means), alway(-s), any (one), X daily, + ever, every (one, way), as many as, + no(-thing), X thoroughly, whatsoever, whole, whosoever" },
      { id: 7, orig: "ἄνθρωπον", bsb: "", gk: 8, en: 7, translit: "anthrōpon", parse: "N-AMS", strong: "G444", gloss: "man", lemma: "ἄνθρωπος", def: "from G3700 (ὀπτάνομαι)); man-faced, i.e. a human being", kjv: "certain, man" },
      { id: 8, orig: "Ἦν", bsb: "was", gk: 0, en: 8, translit: "Ēn", parse: "V-IIA-3S", strong: "G1510", gloss: "is", lemma: "εἰμί", def: "I exist (used only when emphatic)", kjv: "am, have been, X it is I, was" },
      { id: 9, orig: "ἐρχόμενον", bsb: "coming", gk: 9, en: 9, translit: "erchomenon", parse: "V-PPM/P-AMS", strong: "G2064", gloss: "having come", lemma: "ἔρχομαι", def: "to come or go (in a great variety of applications, literally and figuratively)", kjv: "accompany, appear, bring, come, enter, fall out, go, grow, X light, X next, pass, resort, be set" },
      { id: 10, orig: "εἰς", bsb: "into", gk: 10, en: 10, translit: "eis", parse: "Prep", strong: "G1519", gloss: "to", lemma: "εἰς", def: "to or into (indicating the point reached or entered), of place, time, or (figuratively) purpose (result, etc.); also in adverbial phrases", kjv: "(abundant-)ly, against, among, as, at, (back-)ward, before, by, concerning, + continual, + far more exceeding, for (intent, purpose), fore, + forth, in (among, at, unto, -so much that, -to), to the intent that, + of one mind, + never, of, (up-)on, + perish, + set at one again, (so) that, therefore(-unto), throughout, til, to (be, the end, -ward), (here-)until(-to), …ward, (where-)fore, with" },
      { id: 11, orig: "τὸν", bsb: "the", gk: 11, en: 11, translit: "ton", parse: "Art-AMS", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 12, orig: "κόσμον", bsb: "world", gk: 12, en: 12, translit: "kosmon", parse: "N-AMS", strong: "G2889", gloss: "world", lemma: "κόσμος", def: "orderly arrangement, i.e. decoration; by implication, the world (in a wide or narrow sense, including its inhabitants, literally or figuratively (morally))", kjv: "adorning, world" },
    ],
    versions: [
      { abbr: "KJV", text: "That was the true Light, which lighteth every man that cometh into the world." },
      { abbr: "WEB", text: "The true light that enlightens everyone was coming into the world." },
      { abbr: "ASV", text: "There was the true light, even the light which lighteth every man, coming into the world." },
      { abbr: "GNV", text: "This was that true light, which lighteth euery man that commeth into the world." },
      { abbr: "YLT", text: "He was the true Light, which doth enlighten every man, coming to the world;" },
      { abbr: "DBY", text: "The true light was that which, coming into the world, lightens every man." },
    ],
  },
  10: {
    bsb: "He was in the world, and though the world was made through Him, the world did not recognize Him.",
    notes: [
      {
        range: "1:10",
        text: "The world cannot recognize the true light even when it encounters its Creator. The world lives in rebellion, loving darkness more than light (John 3:19).",
      },
      {
        range: "1:1-18",
        text: "The beginning of this prologue (John 1:1-5) might be a poem or hymn sung by the earliest Christians. The prologue’s themes—the coming of the light into the world, the rejection of the light, and its gift of new life to believers—prepares readers for the story that follows.",
      },
    ],
    refs: [
      { label: "John 17:25", text: "Righteous Father, although the world has not known You, I know You, and they know that You sent Me." },
      { label: "1 John 3:1", text: "Behold what manner of love the Father has given to us, that we should be called children of God. And that is what we are! The reason the world does not know us is that it did not know Him." },
      { label: "1 Corinthians 2:8", text: "None of the rulers of this age understood it. For if they had, they would not have crucified the Lord of glory." },
    ],
    refCount: 12,
    words: [
      { id: 0, orig: "ἦν", bsb: "He was", gk: 3, en: 0, translit: "ēn", parse: "V-IIA-3S", strong: "G1510", gloss: "is", lemma: "εἰμί", def: "I exist (used only when emphatic)", kjv: "am, have been, X it is I, was" },
      { id: 1, orig: "ἐν", bsb: "in", gk: 0, en: 1, translit: "en", parse: "Prep", strong: "G1722", gloss: "in", lemma: "ἐν", def: "\"in,\" at, (up-)on, by, etc.", kjv: "about, after, against, + almost, X altogether, among, X as, at, before, between, (here-)by (+ all means), for (… sake of), + give self wholly to, (here-)in(-to, -wardly), X mightily, (because) of, (up-)on, (open-)ly, X outwardly, one, X quickly, X shortly, (speedi-)ly, X that, X there(-in, -on), through(-out), (un-)to(-ward), under, when, where(-with), while, with(-in)" },
      { id: 2, orig: "τῷ", bsb: "the", gk: 1, en: 2, translit: "tō", parse: "Art-DMS", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 3, orig: "κόσμῳ", bsb: "world", gk: 2, en: 3, translit: "kosmō", parse: "N-DMS", strong: "G2889", gloss: "world", lemma: "κόσμος", def: "orderly arrangement, i.e. decoration; by implication, the world (in a wide or narrow sense, including its inhabitants, literally or figuratively (morally))", kjv: "adorning, world" },
      { id: 4, orig: "καὶ", bsb: "and though", gk: 4, en: 4, translit: "kai", parse: "Conj", strong: "G2532", gloss: "and", lemma: "καί", def: "and, also, even, so then, too, etc.; often used in connection (or composition) with other particles or small words", kjv: "and, also, both, but, even, for, if, or, so, that, then, therefore, when, yet" },
      { id: 5, orig: "ὁ", bsb: "the", gk: 5, en: 5, translit: "ho", parse: "Art-NMS", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 6, orig: "κόσμος", bsb: "world", gk: 6, en: 6, translit: "kosmos", parse: "N-NMS", strong: "G2889", gloss: "world", lemma: "κόσμος", def: "orderly arrangement, i.e. decoration; by implication, the world (in a wide or narrow sense, including its inhabitants, literally or figuratively (morally))", kjv: "adorning, world" },
      { id: 7, orig: "ἐγένετο", bsb: "was made", gk: 9, en: 7, translit: "egeneto", parse: "V-AIM-3S", strong: "G1096", gloss: "it came to pass", lemma: "γίνομαι", def: "to cause to be (\"gen\"-erate), i.e. (reflexively) to become (come into being), used with great latitude (literal, figurative, intensive, etc.)", kjv: "arise, be assembled, be(-come, -fall, -have self), be brought (to pass), (be) come (to pass), continue, be divided, draw, be ended, fall, be finished, follow, be found, be fulfilled, + God forbid, grow, happen, have, be kept, be made, be married, be ordained to be, partake, pass, be performed, be published, require, seem, be showed, X soon as it was, sound, be taken, be turned, use, wax, will, would, be wrought" },
      { id: 8, orig: "δι’", bsb: "through", gk: 7, en: 8, translit: "di’", parse: "Prep", strong: "G1223", gloss: "through", lemma: "διά", def: "through (in very wide applications, local, causal, or occasional)", kjv: "after, always, among, at, to avoid, because of (that), briefly, by, for (cause) … fore, from, in, by occasion of, of, by reason of, for sake, that, thereby, therefore, X though, through(-out), to, wherefore, with (-in)" },
      { id: 9, orig: "αὐτοῦ", bsb: "Him", gk: 8, en: 9, translit: "autou", parse: "PPro-GM3S", strong: "G846", gloss: "Him", lemma: "αὐτός", def: "the reflexive pronoun self, used (alone or in the comparative G1438 (ἑαυτοῦ)) of the third person , and (with the proper personal pronoun) of the other persons", kjv: "her, it(-self), one, the other, (mine) own, said, (self-), the) same, ((him-, my-, thy- )self, (your-)selves, she, that, their(-s), them(-selves), there(-at, - by, -in, -into, -of, -on, -with), they, (these) things, this (man), those, together, very, which" },
      { id: 10, orig: "καὶ", bsb: "", gk: 10, en: 10, translit: "kai", parse: "Conj", strong: "G2532", gloss: "and", lemma: "καί", def: "and, also, even, so then, too, etc.; often used in connection (or composition) with other particles or small words", kjv: "and, also, both, but, even, for, if, or, so, that, then, therefore, when, yet" },
      { id: 11, orig: "ὁ", bsb: "the", gk: 11, en: 11, translit: "ho", parse: "Art-NMS", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 12, orig: "κόσμος", bsb: "world", gk: 12, en: 12, translit: "kosmos", parse: "N-NMS", strong: "G2889", gloss: "world", lemma: "κόσμος", def: "orderly arrangement, i.e. decoration; by implication, the world (in a wide or narrow sense, including its inhabitants, literally or figuratively (morally))", kjv: "adorning, world" },
      { id: 13, orig: "οὐκ", bsb: "did not", gk: 14, en: 13, translit: "ouk", parse: "Adv", strong: "G3756", gloss: "not", lemma: "οὐ", def: "the absolute negative (compare G3361 (μή)) adverb; no or not", kjv: "+ long, nay, neither, never, no (X man), none, (can-)not, + nothing, + special, un(-worthy), when, + without, + yet but" },
      { id: 14, orig: "ἔγνω", bsb: "recognize", gk: 15, en: 14, translit: "egnō", parse: "V-AIA-3S", strong: "G1097", gloss: "having known", lemma: "γινώσκω", def: "to \"know\" (absolutely) in a great variety of applications and with many implications (as follow, with others not thus clearly expressed)", kjv: "allow, be aware (of), feel, (have) know(-ledge), perceived, be resolved, can speak, be sure, understand" },
      { id: 15, orig: "αὐτὸν", bsb: "Him", gk: 13, en: 15, translit: "auton", parse: "PPro-AM3S", strong: "G846", gloss: "Him", lemma: "αὐτός", def: "the reflexive pronoun self, used (alone or in the comparative G1438 (ἑαυτοῦ)) of the third person , and (with the proper personal pronoun) of the other persons", kjv: "her, it(-self), one, the other, (mine) own, said, (self-), the) same, ((him-, my-, thy- )self, (your-)selves, she, that, their(-s), them(-selves), there(-at, - by, -in, -into, -of, -on, -with), they, (these) things, this (man), those, together, very, which" },
    ],
    versions: [
      { abbr: "KJV", text: "He was in the world, and the world was made by him, and the world knew him not." },
      { abbr: "WEB", text: "He was in the world, and the world was made through him, and the world didn’t recognize him." },
      { abbr: "ASV", text: "He was in the world, and the world was made through him, and the world knew him not." },
      { abbr: "GNV", text: "He was in the world, and the worlde was made by him: and the worlde knewe him not." },
      { abbr: "YLT", text: "in the world he was, and the world through him was made, and the world did not know him:" },
      { abbr: "DBY", text: "He was in the world, and the world had [its] being through him, and the world knew him not." },
    ],
  },
  11: {
    bsb: "He came to His own, and His own did not receive Him.",
    notes: [
      {
        range: "1:1-18",
        text: "The beginning of this prologue (John 1:1-5) might be a poem or hymn sung by the earliest Christians. The prologue’s themes—the coming of the light into the world, the rejection of the light, and its gift of new life to believers—prepares readers for the story that follows.",
      },
    ],
    refs: [
      { label: "Luke 19:14", text: "But his subjects hated him and sent a delegation after him to say, ‘We do not want this man to rule over us.’" },
      { label: "Isaiah 53:2-3", text: "He grew up before Him like a tender shoot, and like a root out of dry ground. He had no stately form or majesty to attract us, no beauty that we should desire Him." },
      { label: "John 3:32", text: "He testifies to what He has seen and heard, yet no one accepts His testimony." },
    ],
    refCount: 12,
    words: [
      { id: 0, orig: "ἦλθεν", bsb: "He came", gk: 3, en: 0, translit: "ēlthen", parse: "V-AIA-3S", strong: "G2064", gloss: "having come", lemma: "ἔρχομαι", def: "to come or go (in a great variety of applications, literally and figuratively)", kjv: "accompany, appear, bring, come, enter, fall out, go, grow, X light, X next, pass, resort, be set" },
      { id: 1, orig: "εἰς", bsb: "to", gk: 0, en: 1, translit: "eis", parse: "Prep", strong: "G1519", gloss: "to", lemma: "εἰς", def: "to or into (indicating the point reached or entered), of place, time, or (figuratively) purpose (result, etc.); also in adverbial phrases", kjv: "(abundant-)ly, against, among, as, at, (back-)ward, before, by, concerning, + continual, + far more exceeding, for (intent, purpose), fore, + forth, in (among, at, unto, -so much that, -to), to the intent that, + of one mind, + never, of, (up-)on, + perish, + set at one again, (so) that, therefore(-unto), throughout, til, to (be, the end, -ward), (here-)until(-to), …ward, (where-)fore, with" },
      { id: 2, orig: "τὰ", bsb: "His", gk: 1, en: 2, translit: "ta", parse: "Art-ANP", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 3, orig: "ἴδια", bsb: "own", gk: 2, en: 3, translit: "idia", parse: "Adj-ANP", strong: "G2398", gloss: "own", lemma: "ἴδιος", def: "pertaining to self, i.e. one's own; by implication, private or separate", kjv: "X his acquaintance, when they were alone, apart, aside, due, his (own, proper, several), home, (her, our, thine, your) own (business), private(-ly), proper, severally, their (own)" },
      { id: 4, orig: "καὶ", bsb: "and", gk: 4, en: 4, translit: "kai", parse: "Conj", strong: "G2532", gloss: "and", lemma: "καί", def: "and, also, even, so then, too, etc.; often used in connection (or composition) with other particles or small words", kjv: "and, also, both, but, even, for, if, or, so, that, then, therefore, when, yet" },
      { id: 5, orig: "οἱ", bsb: "His", gk: 5, en: 5, translit: "hoi", parse: "Art-NMP", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 6, orig: "ἴδιοι", bsb: "own", gk: 6, en: 6, translit: "idioi", parse: "Adj-NMP", strong: "G2398", gloss: "own", lemma: "ἴδιος", def: "pertaining to self, i.e. one's own; by implication, private or separate", kjv: "X his acquaintance, when they were alone, apart, aside, due, his (own, proper, several), home, (her, our, thine, your) own (business), private(-ly), proper, severally, their (own)" },
      { id: 7, orig: "οὐ", bsb: "did not", gk: 8, en: 7, translit: "ou", parse: "Adv", strong: "G3756", gloss: "not", lemma: "οὐ", def: "the absolute negative (compare G3361 (μή)) adverb; no or not", kjv: "+ long, nay, neither, never, no (X man), none, (can-)not, + nothing, + special, un(-worthy), when, + without, + yet but" },
      { id: 8, orig: "παρέλαβον", bsb: "receive", gk: 9, en: 8, translit: "parelabon", parse: "V-AIA-3P", strong: "G3880", gloss: "having taken", lemma: "παραλαμβάνω", def: "to receive near, i.e. associate with oneself (in any familiar or intimate act or relation); by analogy, to assume an office; figuratively, to learn", kjv: "receive, take (unto, with)" },
      { id: 9, orig: "αὐτὸν", bsb: "Him", gk: 7, en: 9, translit: "auton", parse: "PPro-AM3S", strong: "G846", gloss: "Him", lemma: "αὐτός", def: "the reflexive pronoun self, used (alone or in the comparative G1438 (ἑαυτοῦ)) of the third person , and (with the proper personal pronoun) of the other persons", kjv: "her, it(-self), one, the other, (mine) own, said, (self-), the) same, ((him-, my-, thy- )self, (your-)selves, she, that, their(-s), them(-selves), there(-at, - by, -in, -into, -of, -on, -with), they, (these) things, this (man), those, together, very, which" },
    ],
    versions: [
      { abbr: "KJV", text: "He came unto his own, and his own received him not." },
      { abbr: "WEB", text: "He came to his own, and those who were his own didn’t receive him." },
      { abbr: "ASV", text: "He came unto his own, and they that were his own received him not." },
      { abbr: "GNV", text: "He came vnto his owne, and his owne receiued him not." },
      { abbr: "YLT", text: "to his own things he came, and his own people did not receive him;" },
      { abbr: "DBY", text: "He came to his own, and his own received him not;" },
    ],
  },
  12: {
    bsb: "But to all who did receive Him, to those who believed in His name, He gave the right to become children of God—",
    notes: [
      {
        range: "1:12",
        text: "Only through divine renewal can people follow the light and enter God’s family (John 3:1-17). • Individuals must believe in Christ to become children of God (John 12:35-36).",
      },
      {
        range: "1:1-18",
        text: "The beginning of this prologue (John 1:1-5) might be a poem or hymn sung by the earliest Christians. The prologue’s themes—the coming of the light into the world, the rejection of the light, and its gift of new life to believers—prepares readers for the story that follows.",
      },
    ],
    refs: [
      { label: "Galatians 3:26", text: "You are all sons of God through faith in Christ Jesus." },
      { label: "Romans 8:14", text: "For all who are led by the Spirit of God are sons of God." },
      { label: "1 John 3:1", text: "Behold what manner of love the Father has given to us, that we should be called children of God. And that is what we are! The reason the world does not know us is that it did not know Him." },
    ],
    refCount: 12,
    words: [
      { id: 0, orig: "δὲ", bsb: "But", gk: 1, en: 0, translit: "de", parse: "Conj", strong: "G1161", gloss: "now", lemma: "δέ", def: "but, and, etc.", kjv: "also, and, but, moreover, now (often unexpressed in English)" },
      { id: 1, orig: "αὐτοῖς", bsb: "to", gk: 5, en: 1, translit: "autois", parse: "PPro-DM3P", strong: "G846", gloss: "Him", lemma: "αὐτός", def: "the reflexive pronoun self, used (alone or in the comparative G1438 (ἑαυτοῦ)) of the third person , and (with the proper personal pronoun) of the other persons", kjv: "her, it(-self), one, the other, (mine) own, said, (self-), the) same, ((him-, my-, thy- )self, (your-)selves, she, that, their(-s), them(-selves), there(-at, - by, -in, -into, -of, -on, -with), they, (these) things, this (man), those, together, very, which" },
      { id: 2, orig: "ὅσοι", bsb: "all who", gk: 0, en: 2, translit: "hosoi", parse: "RelPro-NMP", strong: "G3745", gloss: "as much as", lemma: "ὅσος", def: "as (much, great, long, etc.) as", kjv: "all (that), as (long, many, much) (as), how great (many, much), (in-)asmuch as, so many as, that (ever), the more, those things, what (great, -soever), wheresoever, wherewithsoever, which, X while, who(-soever)" },
      { id: 3, orig: "ἔλαβον", bsb: "did receive", gk: 2, en: 3, translit: "elabon", parse: "V-AIA-3P", strong: "G2983", gloss: "having taken", lemma: "λαμβάνω", def: "while G138 (αἱρέομαι) is more violent, to seize or remove))", kjv: "accept, + be amazed, assay, attain, bring, X when I call, catch, come on (X unto), + forget, have, hold, obtain, receive (X after), take (away, up)" },
      { id: 4, orig: "αὐτόν", bsb: "Him", gk: 3, en: 4, translit: "auton", parse: "PPro-AM3S", strong: "G846", gloss: "Him", lemma: "αὐτός", def: "the reflexive pronoun self, used (alone or in the comparative G1438 (ἑαυτοῦ)) of the third person , and (with the proper personal pronoun) of the other persons", kjv: "her, it(-self), one, the other, (mine) own, said, (self-), the) same, ((him-, my-, thy- )self, (your-)selves, she, that, their(-s), them(-selves), there(-at, - by, -in, -into, -of, -on, -with), they, (these) things, this (man), those, together, very, which" },
      { id: 5, orig: "τοῖς", bsb: "to those", gk: 10, en: 5, translit: "tois", parse: "Art-DMP", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 6, orig: "πιστεύουσιν", bsb: "who believed", gk: 11, en: 6, translit: "pisteuousin", parse: "V-PPA-DMP", strong: "G4100", gloss: "believing", lemma: "πιστεύω", def: "to have faith (in, upon, or with respect to, a person or thing), i.e. credit; by implication, to entrust (especially one's spiritual well-being to Christ)", kjv: "believe(-r), commit (to trust), put in trust with" },
      { id: 7, orig: "εἰς", bsb: "in", gk: 12, en: 7, translit: "eis", parse: "Prep", strong: "G1519", gloss: "to", lemma: "εἰς", def: "to or into (indicating the point reached or entered), of place, time, or (figuratively) purpose (result, etc.); also in adverbial phrases", kjv: "(abundant-)ly, against, among, as, at, (back-)ward, before, by, concerning, + continual, + far more exceeding, for (intent, purpose), fore, + forth, in (among, at, unto, -so much that, -to), to the intent that, + of one mind, + never, of, (up-)on, + perish, + set at one again, (so) that, therefore(-unto), throughout, til, to (be, the end, -ward), (here-)until(-to), …ward, (where-)fore, with" },
      { id: 8, orig: "αὐτοῦ", bsb: "His", gk: 15, en: 8, translit: "autou", parse: "PPro-GM3S", strong: "G846", gloss: "Him", lemma: "αὐτός", def: "the reflexive pronoun self, used (alone or in the comparative G1438 (ἑαυτοῦ)) of the third person , and (with the proper personal pronoun) of the other persons", kjv: "her, it(-self), one, the other, (mine) own, said, (self-), the) same, ((him-, my-, thy- )self, (your-)selves, she, that, their(-s), them(-selves), there(-at, - by, -in, -into, -of, -on, -with), they, (these) things, this (man), those, together, very, which" },
      { id: 9, orig: "τὸ", bsb: "", gk: 13, en: 9, translit: "to", parse: "Art-ANS", strong: "G3588", gloss: "the", lemma: "ὁ", def: "the (sometimes to be supplied, at others omitted, in English idiom)", kjv: "the, this, that, one, he, she, it, etc" },
      { id: 10, orig: "ὄνομα", bsb: "name", gk: 14, en: 10, translit: "onoma", parse: "N-ANS", strong: "G3686", gloss: "name", lemma: "ὄνομα", def: "a \"name\" (literally or figuratively) (authority, character)", kjv: "called, (+ sur-)name(-d)" },
      { id: 11, orig: "ἔδωκεν", bsb: "He gave", gk: 4, en: 11, translit: "edōken", parse: "V-AIA-3S", strong: "G1325", gloss: "to give", lemma: "δίδωμι", def: "to give (used in a very wide application, properly, or by implication, literally or figuratively; greatly modified by the connection)", kjv: "adventure, bestow, bring forth, commit, deliver (up), give, grant, hinder, make, minister, number, offer, have power, put, receive, set, shew, smite (+ with the hand), strike (+ with the palm of the hand), suffer, take, utter, yield" },
      { id: 12, orig: "ἐξουσίαν", bsb: "the right", gk: 6, en: 12, translit: "exousian", parse: "N-AFS", strong: "G1849", gloss: "authority", lemma: "ἐξουσία", def: "privilege, i.e. (subjectively) force, capacity, competency, freedom, or (objectively) mastery (concretely, magistrate, superhuman, potentate, token of control), delegated influence", kjv: "authority, jurisdiction, liberty, power, right, strength" },
      { id: 13, orig: "γενέσθαι", bsb: "to become", gk: 9, en: 13, translit: "genesthai", parse: "V-ANM", strong: "G1096", gloss: "it came to pass", lemma: "γίνομαι", def: "to cause to be (\"gen\"-erate), i.e. (reflexively) to become (come into being), used with great latitude (literal, figurative, intensive, etc.)", kjv: "arise, be assembled, be(-come, -fall, -have self), be brought (to pass), (be) come (to pass), continue, be divided, draw, be ended, fall, be finished, follow, be found, be fulfilled, + God forbid, grow, happen, have, be kept, be made, be married, be ordained to be, partake, pass, be performed, be published, require, seem, be showed, X soon as it was, sound, be taken, be turned, use, wax, will, would, be wrought" },
      { id: 14, orig: "τέκνα", bsb: "children", gk: 7, en: 14, translit: "tekna", parse: "N-ANP", strong: "G5043", gloss: "children", lemma: "τέκνον", def: "a child (as produced)", kjv: "child, daughter, son" },
      { id: 15, orig: "Θεοῦ", bsb: "of God", gk: 8, en: 15, translit: "Theou", parse: "N-GMS", strong: "G2316", gloss: "God", lemma: "θεός", def: "figuratively, a magistrate; by Hebraism, very", kjv: "X exceeding, God, god(-ly, -ward)" },
    ],
    versions: [
      { abbr: "KJV", text: "But as many as received him, to them gave he power to become the sons of God, even to them that believe on his name:" },
      { abbr: "WEB", text: "But as many as received him, to them he gave the right to become God’s children, to those who believe in his name:" },
      { abbr: "ASV", text: "But as many as received him, to them gave he the right to become children of God, even to them that believe on his name:" },
      { abbr: "GNV", text: "But as many as receiued him, to them he gaue prerogatiue to be the sonnes of God, euen to them that beleeue in his Name." },
      { abbr: "YLT", text: "but as many as did receive him to them he gave authority to become sons of God — to those believing in his name," },
      { abbr: "DBY", text: "but as many as received him, to them gave he [the] right to be children of God, to those that believe on his name;" },
    ],
  },
  13: {
    bsb: "children born not of blood, nor of the desire or will of man, but born of God.",
    notes: [
      {
        range: "1:13",
        text: "a birth that comes from God: People can escape the darkness only by God’s grace (John 8:12; John 12:35-36, John 12:44-46).",
      },
      {
        range: "1:1-18",
        text: "The beginning of this prologue (John 1:1-5) might be a poem or hymn sung by the earliest Christians. The prologue’s themes—the coming of the light into the world, the rejection of the light, and its gift of new life to believers—prepares readers for the story that follows.",
      },
    ],
    refs: [
      { label: "James 1:18", text: "He chose to give us birth through the word of truth, that we would be a kind of firstfruits of His creation." },
      { label: "1 John 3:9", text: "Anyone born of God refuses to practice sin, because God’s seed abides in him; he cannot go on sinning, because he has been born of God." },
      { label: "1 Peter 1:23", text: "For you have been born again, not of perishable seed, but of imperishable, through the living and enduring word of God." },
    ],
    refCount: 12,
    words: [
      { id: 0, orig: "οἳ", bsb: "children born", gk: 0, en: 0, translit: "hoi", parse: "RelPro-NMP", strong: "G3739", gloss: "which", lemma: "ὅς", def: "the relatively (sometimes demonstrative) pronoun, who, which, what, that", kjv: "one, (an-, the) other, some, that, what, which, who(-m, -se), etc" },
      { id: 1, orig: "οὐκ", bsb: "not", gk: 1, en: 1, translit: "ouk", parse: "Adv", strong: "G3756", gloss: "not", lemma: "οὐ", def: "the absolute negative (compare G3361 (μή)) adverb; no or not", kjv: "+ long, nay, neither, never, no (X man), none, (can-)not, + nothing, + special, un(-worthy), when, + without, + yet but" },
      { id: 2, orig: "ἐξ", bsb: "of", gk: 2, en: 2, translit: "ex", parse: "Prep", strong: "G1537", gloss: "of", lemma: "ἐκ", def: "literal or figurative; direct or remote)", kjv: "after, among, X are, at, betwixt(-yond), by (the means of), exceedingly, (+ abundantly above), for(- th), from (among, forth, up), + grudgingly, + heartily, X heavenly, X hereby, + very highly, in, …ly, (because, by reason) of, off (from), on, out among (from, of), over, since, X thenceforth, through, X unto, X vehemently, with(-out)" },
      { id: 3, orig: "αἱμάτων", bsb: "blood", gk: 3, en: 3, translit: "haimatōn", parse: "N-GNP", strong: "G129", gloss: "blood", lemma: "αἷμα", def: "blood, literally (of men or animals), figuratively (the juice of grapes) or specially (the atoning blood of Christ); by implication, bloodshed, also kindred", kjv: "blood" },
      { id: 4, orig: "οὐδὲ", bsb: "nor", gk: 4, en: 4, translit: "oude", parse: "Conj", strong: "G3761", gloss: "nor", lemma: "οὐδέ", def: "not however, i.e. neither, nor, not even", kjv: "neither (indeed), never, no (more, nor, not), nor (yet), (also, even, then) not (even, so much as), + nothing, so much as" },
      { id: 5, orig: "ἐκ", bsb: "of", gk: 5, en: 5, translit: "ek", parse: "Prep", strong: "G1537", gloss: "of", lemma: "ἐκ", def: "literal or figurative; direct or remote)", kjv: "after, among, X are, at, betwixt(-yond), by (the means of), exceedingly, (+ abundantly above), for(- th), from (among, forth, up), + grudgingly, + heartily, X heavenly, X hereby, + very highly, in, …ly, (because, by reason) of, off (from), on, out among (from, of), over, since, X thenceforth, through, X unto, X vehemently, with(-out)" },
      { id: 6, orig: "θελήματος", bsb: "the desire", gk: 6, en: 6, translit: "thelēmatos", parse: "N-GNS", strong: "G2307", gloss: "will", lemma: "θέλημα", def: "a determination (properly, the thing), i.e. (actively) choice (specially, purpose, decree; abstractly, volition) or (passively) inclination", kjv: "desire, pleasure, will" },
      { id: 7, orig: "σαρκὸς", bsb: "", gk: 7, en: 7, translit: "sarkos", parse: "N-GFS", strong: "G4561", gloss: "flesh", lemma: "σάρξ", def: "flesh (as stripped of the skin), i.e. (strictly) the meat of an animal (as food), or (by extension) the body (as opposed to the soul (or spirit), or as the symbol of what is external, or as the means of kindred), or (by implication) human nature (with its frailties (physically or morally) and passions), or (specially), a human being (as such)", kjv: "carnal(-ly, + -ly minded), flesh(-ly)" },
      { id: 8, orig: "οὐδὲ", bsb: "or", gk: 8, en: 8, translit: "oude", parse: "Conj", strong: "G3761", gloss: "nor", lemma: "οὐδέ", def: "not however, i.e. neither, nor, not even", kjv: "neither (indeed), never, no (more, nor, not), nor (yet), (also, even, then) not (even, so much as), + nothing, so much as" },
      { id: 9, orig: "ἐκ", bsb: "", gk: 9, en: 9, translit: "ek", parse: "Prep", strong: "G1537", gloss: "of", lemma: "ἐκ", def: "literal or figurative; direct or remote)", kjv: "after, among, X are, at, betwixt(-yond), by (the means of), exceedingly, (+ abundantly above), for(- th), from (among, forth, up), + grudgingly, + heartily, X heavenly, X hereby, + very highly, in, …ly, (because, by reason) of, off (from), on, out among (from, of), over, since, X thenceforth, through, X unto, X vehemently, with(-out)" },
      { id: 10, orig: "θελήματος", bsb: "will", gk: 10, en: 10, translit: "thelēmatos", parse: "N-GNS", strong: "G2307", gloss: "will", lemma: "θέλημα", def: "a determination (properly, the thing), i.e. (actively) choice (specially, purpose, decree; abstractly, volition) or (passively) inclination", kjv: "desire, pleasure, will" },
      { id: 11, orig: "ἀνδρὸς", bsb: "of man", gk: 11, en: 11, translit: "andros", parse: "N-GMS", strong: "G435", gloss: "men", lemma: "ἀνήρ", def: "a man (properly as an individual male)", kjv: "fellow, husband, man, sir" },
      { id: 12, orig: "ἀλλ’", bsb: "but", gk: 12, en: 12, translit: "all’", parse: "Conj", strong: "G235", gloss: "but", lemma: "ἀλλά", def: "properly, other things, i.e. (adverbially) contrariwise (in many relations)", kjv: "and, but (even), howbeit, indeed, nay, nevertheless, no, notwithstanding, save, therefore, yea, yet" },
      { id: 13, orig: "ἐγεννήθησαν", bsb: "born", gk: 15, en: 13, translit: "egennēthēsan", parse: "V-AIP-3P", strong: "G1080", gloss: "begat", lemma: "γεννάω", def: "to procreate (properly, of the father, but by extension of the mother); figuratively, to regenerate", kjv: "bear, beget, be born, bring forth, conceive, be delivered of, gender, make, spring" },
      { id: 14, orig: "ἐκ", bsb: "of", gk: 13, en: 14, translit: "ek", parse: "Prep", strong: "G1537", gloss: "of", lemma: "ἐκ", def: "literal or figurative; direct or remote)", kjv: "after, among, X are, at, betwixt(-yond), by (the means of), exceedingly, (+ abundantly above), for(- th), from (among, forth, up), + grudgingly, + heartily, X heavenly, X hereby, + very highly, in, …ly, (because, by reason) of, off (from), on, out among (from, of), over, since, X thenceforth, through, X unto, X vehemently, with(-out)" },
      { id: 15, orig: "Θεοῦ", bsb: "God", gk: 14, en: 15, translit: "Theou", parse: "N-GMS", strong: "G2316", gloss: "God", lemma: "θεός", def: "figuratively, a magistrate; by Hebraism, very", kjv: "X exceeding, God, god(-ly, -ward)" },
    ],
    versions: [
      { abbr: "KJV", text: "Which were born, not of blood, nor of the will of the flesh, nor of the will of man, but of God." },
      { abbr: "WEB", text: "who were born, not of blood, nor of the will of the flesh, nor of the will of man, but of God." },
      { abbr: "ASV", text: "who were born, not of blood, nor of the will of the flesh, nor of the will of man, but of God." },
      { abbr: "GNV", text: "Which are borne not of blood, nor of the will of the flesh, nor of ye wil of man, but of God." },
      { abbr: "YLT", text: "who — not of blood nor of a will of flesh, nor of a will of man but — of God were begotten." },
      { abbr: "DBY", text: "who have been born, not of blood, nor of flesh’s will, nor of man’s will, but of God." },
    ],
  },
};

// The reader's highlight palette (dark-theme values, since the mockup is dark).
const HIGHLIGHT_COLORS: { name: string; dot: string; bg: string }[] = [
  { name: "yellow", dot: "bg-yellow-400", bg: "bg-yellow-400/15" },
  { name: "green", dot: "bg-emerald-400", bg: "bg-emerald-400/15" },
  { name: "blue", dot: "bg-blue-400", bg: "bg-blue-400/15" },
  { name: "pink", dot: "bg-pink-400", bg: "bg-pink-400/15" },
];

/** Verse number as the reader renders it: muted superscript, amber on hover. */
function VerseNum({ num, onTap }: { num: number; onTap: () => void }) {
  return (
    <sup
      title="Verse tools"
      onClick={onTap}
      className="ml-1 mr-px cursor-pointer select-none align-super font-sans text-[0.6em] font-normal leading-none text-neutral-500/70 transition-colors hover:text-amber-400"
    >
      {num}
    </sup>
  );
}

/** Collapsible section row, as in the reader's verse sheet. */
function MockSheetSection({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-neutral-800">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-3 text-left"
      >
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-neutral-400">
          {title}
          {count != null && (
            <span className="font-medium tracking-normal text-neutral-400">({count})</span>
          )}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-neutral-600 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

/** The "Original words" body — the reader's reverse interlinear: the Greek
 * and the BSB as two linked, tappable sentences. Tap a word in either line
 * and its partner highlights in the other, with its details shown beneath;
 * with a word selected, the left/right arrow keys step through its line. */
function MockInterlinear({ words }: { words: MockWord[] }) {
  const [sel, setSel] = useState<{ line: "orig" | "eng"; idx: number } | null>(null);
  useEffect(() => setSel(null), [words]);

  // Focus follows the selection, so the focus outline never lingers on the
  // word first clicked while the arrows move the highlight elsewhere.
  const btnRefs = useRef(new Map<string, HTMLButtonElement>());

  const original = useMemo(
    () => [...words].filter((w) => w.orig).sort((a, b) => a.gk - b.gk),
    [words],
  );
  const english = useMemo(
    () => [...words].filter((w) => w.bsb).sort((a, b) => a.en - b.en),
    [words],
  );

  const lineOf = (l: "orig" | "eng") => (l === "orig" ? original : english);
  const selId = sel ? lineOf(sel.line)[sel.idx]?.id ?? null : null;
  const detail = selId == null ? null : words.find((w) => w.id === selId) ?? null;

  // A selected word owns the arrow keys, exactly as in the reader.
  useEffect(() => {
    if (!sel) return;
    const len = lineOf(sel.line).length;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      e.preventDefault();
      e.stopPropagation();
      const next = sel!.idx + (e.key === "ArrowRight" ? 1 : -1);
      if (next < 0 || next >= len) return;
      setSel({ line: sel!.line, idx: next });
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, original, english]);

  useEffect(() => {
    if (!sel) return;
    btnRefs.current.get(`${sel.line}-${sel.idx}`)?.focus({ preventScroll: true });
  }, [sel]);

  function renderLine(items: MockWord[], line: "orig" | "eng") {
    return items.map((w, i) => (
      <Fragment key={`${line}-${i}`}>
        {i > 0 && " "}
        <button
          ref={(node) => {
            const k = `${line}-${i}`;
            if (node) btnRefs.current.set(k, node);
            else btnRefs.current.delete(k);
          }}
          onClick={() =>
            setSel((c) => (c && c.line === line && c.idx === i ? null : { line, idx: i }))
          }
          className={`rounded px-0.5 transition-colors ${
            selId != null && w.id === selId
              ? "bg-amber-500/30 text-amber-100"
              : "hover:bg-neutral-800"
          }`}
        >
          {line === "orig" ? w.orig : w.bsb}
        </button>
      </Fragment>
    ));
  }

  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
        Greek
      </p>
      <p className="text-[0.95rem] leading-loose text-neutral-100">
        {renderLine(original, "orig")}
      </p>

      <p className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
        BSB
      </p>
      <p className="text-[0.95rem] leading-loose text-neutral-200">
        {renderLine(english, "eng")}
      </p>

      {detail && (
        <div className="mt-3 rounded-lg bg-neutral-800/60 px-3 py-2 text-sm leading-relaxed text-neutral-400">
          {detail.strong ? (
            <>
              <p>
                <span className="font-medium text-neutral-300">
                  {detail.lemma || detail.orig}
                </span>{" "}
                <span className="italic text-neutral-400">{detail.translit}</span>
                {detail.parse && (
                  <span className="ml-1.5 text-xs text-neutral-400">{detail.parse}</span>
                )}
                <span className="ml-1.5 text-[10px] font-medium tabular-nums text-neutral-600">
                  {detail.strong}
                </span>
              </p>
              {(detail.gloss || detail.def) && (
                <p className="mt-0.5">
                  {detail.gloss && (
                    <span className="font-medium text-neutral-300">{detail.gloss}</span>
                  )}
                  {detail.gloss && detail.def && " — "}
                  {detail.def}
                </p>
              )}
              {detail.kjv && (
                <p className="mt-1 text-xs text-neutral-500">KJV renderings: {detail.kjv}</p>
              )}
            </>
          ) : (
            <p className="italic">Added by the translators — not a separate Greek word.</p>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] text-neutral-400">
        TAGNT from{" "}
        <a
          href="https://github.com/STEPBible/STEPBible-Data"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-neutral-600 underline-offset-2 hover:text-neutral-300"
        >
          STEPBible
        </a>{" "}
        (CC BY 4.0); definitions from Strong’s via{" "}
        <a
          href="https://github.com/openscriptures/strongs"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-neutral-600 underline-offset-2 hover:text-neutral-300"
        >
          Open Scriptures
        </a>{" "}
        (CC-BY-SA)
      </p>
    </div>
  );
}

/** The verse-tools bottom sheet, scoped to the mockup frame. */
function MockVerseSheet({
  verse,
  highlight,
  note,
  onHighlight,
  onSaveNote,
  onClose,
}: {
  verse: number;
  highlight: string | null;
  note: string;
  onHighlight: (color: string | null) => void;
  onSaveNote: (note: string) => void;
  onClose: () => void;
}) {
  const data = VERSES[verse];
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(note);
  const [copied, setCopied] = useState(false);

  const toggle = (id: string) => setOpenSection((s) => (s === id ? null : id));

  function copyVerse() {
    void navigator.clipboard
      .writeText(`“${data.bsb}” — John 1:${verse} (BSB)`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
  }

  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center">
      <div className="absolute inset-0 rounded-xl bg-black/40" onClick={onClose} />

      <div className="relative flex max-h-[92%] w-full flex-col rounded-t-2xl border border-b-0 border-neutral-700 bg-neutral-900 shadow-2xl">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-neutral-700" />
        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-2 pt-1">
          <span className="text-base font-semibold text-gold-bright">
            John 1:{verse}
            <span className="ml-2 text-xs font-medium text-neutral-400">BSB</span>
          </span>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-xl leading-none text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
            aria-label="Close verse panel"
          >
            &times;
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-6">
          <p className="font-scripture font-normal leading-relaxed text-neutral-300">{data.bsb}</p>

          {/* Actions: highlight colors, note, copy */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.name}
                onClick={() => onHighlight(highlight === c.name ? null : c.name)}
                className={`h-7 w-7 rounded-full ${c.dot} transition-transform hover:scale-110 ${
                  highlight === c.name
                    ? "ring-2 ring-neutral-400 ring-offset-2 ring-offset-neutral-900"
                    : ""
                }`}
                aria-label={`Highlight ${c.name}`}
              />
            ))}
            <div className="mx-1 h-5 w-px bg-neutral-700" />
            <button
              onClick={() => setNoteOpen((o) => !o)}
              className="rounded-full border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800"
            >
              {note ? "Edit note" : "Note"}
            </button>
            <button
              onClick={copyVerse}
              className="rounded-full border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>

          {noteOpen && (
            <div className="mt-3">
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Your note on this verse…"
                rows={3}
                className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-amber-400"
              />
              <div className="mt-1.5 flex justify-end gap-2">
                <button
                  onClick={() => setNoteOpen(false)}
                  className="rounded-md px-3 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onSaveNote(noteDraft.trim());
                    setNoteOpen(false);
                  }}
                  className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-neutral-950 hover:bg-amber-700"
                >
                  Save note
                </button>
              </div>
            </div>
          )}
          {!noteOpen && note && (
            <p className="mt-3 rounded-lg bg-neutral-800/60 px-3 py-2 text-sm italic text-neutral-400">
              ✎ {note}
            </p>
          )}

          <div className="mt-5">
            {/* Tyndale study notes */}
            <MockSheetSection
              title="Study notes"
              count={data.notes.length}
              open={openSection === "tyndale"}
              onToggle={() => toggle("tyndale")}
            >
              <ul className="space-y-3">
                {data.notes.map((n) => (
                  <li key={n.range} className="text-sm leading-relaxed text-neutral-300">
                    <span className="mb-0.5 mr-2 inline-block rounded-md bg-neutral-800 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-neutral-400">
                      {n.range}
                    </span>
                    {n.text}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-neutral-400">
                Adapted from{" "}
                <a
                  href="https://tyndaleopenresources.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-neutral-600 underline-offset-2 hover:text-neutral-300"
                >
                  Tyndale Open Study Notes
                </a>
                , &copy; Tyndale House Publishers (CC BY-SA 4.0)
              </p>
            </MockSheetSection>

            {/* Cross-references */}
            <MockSheetSection
              title="Cross-references"
              count={data.refCount}
              open={openSection === "refs"}
              onToggle={() => toggle("refs")}
            >
              <ul className="space-y-1">
                {data.refs.map((r) => (
                  <li key={r.label} className="rounded-lg px-2 py-1.5 text-sm">
                    <span className="font-semibold text-gold-bright">{r.label}</span>{" "}
                    <span className="leading-relaxed text-neutral-300">{r.text}</span>
                  </li>
                ))}
              </ul>
              {data.refs.length === 0 && (
                <p className="px-2 text-sm text-neutral-500">No cross-references catalogued for this verse.</p>
              )}
              {data.refCount > data.refs.length && (
                <p className="mt-1 px-2 text-xs font-medium text-gold-bright">
                  …and {data.refCount - data.refs.length} more in the app
                </p>
              )}
              <p className="mt-2 text-[11px] text-neutral-400">
                Treasury of Scripture Knowledge, via{" "}
                <a
                  href="https://www.openbible.info/labs/cross-references/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-neutral-600 underline-offset-2 hover:text-neutral-300"
                >
                  OpenBible.info
                </a>{" "}
                (CC-BY)
              </p>
            </MockSheetSection>

            {/* Original-language words — the reader's reverse interlinear */}
            <MockSheetSection
              title="Original words"
              count={data.words.length}
              open={openSection === "words"}
              onToggle={() => toggle("words")}
            >
              <MockInterlinear words={data.words} />
            </MockSheetSection>

            {/* Other translations */}
            <MockSheetSection
              title="Other translations"
              count={data.versions.length}
              open={openSection === "versions"}
              onToggle={() => toggle("versions")}
            >
              <ul className="space-y-3">
                {data.versions.map((v) => (
                  <li key={v.abbr} className="text-sm leading-relaxed">
                    <span className="mr-2 inline-block rounded-md bg-neutral-800 px-1.5 py-0.5 text-xs font-semibold text-neutral-400">
                      {v.abbr}
                    </span>
                    <span className="font-scripture font-normal text-neutral-300">{v.text}</span>
                  </li>
                ))}
              </ul>
            </MockSheetSection>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroMockup() {
  const [sheetVerse, setSheetVerse] = useState<number | null>(null);
  const [highlights, setHighlights] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  function openVerse(num: number) {
    setSheetVerse(num);
  }

  // A verse's text run: tappable (opens the verse tools), gold hover, and
  // tinted when highlighted — the reader's .vtext affordance.
  function verseSpan(num: number, text: string) {
    const hl = highlights[num];
    const bg = hl ? HIGHLIGHT_COLORS.find((c) => c.name === hl)?.bg : undefined;
    return (
      <span
        onClick={() => openVerse(num)}
        title="Verse tools"
        className={`cursor-pointer rounded-sm transition-colors hover:bg-[rgb(211_168_60_/_0.16)] ${bg ?? ""}`}
      >
        {text}
        {notes[num] && <span className="ml-0.5 align-super text-[0.6em] text-neutral-500">✎</span>}
      </span>
    );
  }

  return (
    <>
    <style>{`
      .hero-mockup-scroll { scrollbar-width: thin; scrollbar-color: #9a9fa3 #14110f; }
      .hero-mockup-scroll::-webkit-scrollbar { width: 12px; }
      .hero-mockup-scroll::-webkit-scrollbar-track { background: #14110f; }
      .hero-mockup-scroll::-webkit-scrollbar-thumb { background: #9a9fa3; border-radius: 6px; border: 2px solid #14110f; }
      .hero-mockup-scroll::-webkit-scrollbar-thumb:hover { background: #c4c4c4; }
    `}</style>
    {/* 15% down from full size. Scaled rather than narrowed: the app inside
        is built from fixed-px type, so a smaller box would only reflow it and
        leave 16px scripture in a shrunken frame.

        The 85% is on the wrapper and the zoom on the panel, and it has to be
        that way round. zoom resolves the panel's w-full against its parent
        *after* zooming, so the panel always fills whatever box it is given —
        put the zoom on a full-width panel and the width never moves, which
        squashes it. Handed an 85% box, it fills that instead, and lays its
        contents out at 1/0.85 of it, so type and height come down together.

        transform: scale would shrink it just as evenly but leaves the
        original box behind: the panel's height is content-driven and varies
        with the column, so nothing static could reclaim the gap. */}
    <div className="mx-auto w-[85%] max-w-3xl">
      <div
        style={{ zoom: 0.85 }}
        className="dark relative overflow-hidden rounded-xl border border-neutral-700 bg-neutral-925 shadow-2xl"
      >
      {/* Scrollable app viewport — mirrors the reading page, sticky header included */}
      {/* No overscroll containment: when this inner scroller hits its top or
          bottom, the wheel must chain to the page scroll. */}
      <div className="hero-mockup-scroll max-h-[736px] overflow-y-auto">
        {/* App header — same layout as the real reader header. The real one is
            built from buttons, whose text the browser never lets you select;
            these are display-only spans, so match that with select-none. */}
        <div className="sticky top-0 z-10 select-none border-b border-neutral-700 bg-neutral-925/95 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-base font-bold text-neutral-200">Readability</span>
              <div className="h-5 w-px shrink-0 bg-neutral-700" />
              <span className="flex shrink-0 items-center gap-1.5 px-1.5 py-1 text-sm text-neutral-500">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                {/* Breakpoints track the viewport but the frame is a half-
                    column from md to lg, so hide the label in that band. */}
                <span className="hidden sm:inline md:hidden lg:inline">Library</span>
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span className="rounded-md p-1.5 text-neutral-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              </span>
              <span className="flex items-center gap-1 rounded-md px-2 py-1 text-[0.65rem] font-semibold leading-none text-neutral-400">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Map
              </span>
              <span className="flex items-center gap-1 rounded-md px-2 py-1 text-[0.65rem] font-semibold leading-none text-neutral-400">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Notes
              </span>
              <span className="rounded-md p-1.5 text-neutral-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="7" x2="20" y2="7" />
                  <circle cx="9" cy="7" r="2.2" fill="currentColor" />
                  <line x1="4" y1="17" x2="20" y2="17" />
                  <circle cx="15" cy="17" r="2.2" fill="currentColor" />
                </svg>
              </span>
            </div>
          </div>
          {/* Book selector + chapter strip */}
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-7 shrink-0 items-center rounded-md border border-neutral-600 px-2.5 text-sm font-medium text-neutral-300">
              John <span className="ml-1 text-neutral-500">▾</span>
            </span>
            <div className="flex min-w-0 flex-1 gap-1 overflow-hidden py-0.5 pl-0.5">
              {/* Overview chip + chapter chips, styled as the reader's strip:
                  muted gold chip, gold-ringed current chapter, quiet rest. */}
              <span className="flex h-7 shrink-0 items-center rounded bg-amber-400/10 px-2.5 text-xs font-semibold text-gold-bright">
                Overview
              </span>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => (
                <span
                  key={num}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs ${
                    num === 1
                      ? "bg-amber-400/20 font-bold text-amber-100 ring-2 ring-amber-400"
                      : "bg-neutral-800 text-neutral-400"
                  }`}
                >
                  {num}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Reading content */}
        <div className="space-y-4 bg-neutral-925 p-5 pb-6 sm:p-6 sm:pb-7" style={{ fontSize: "16px" }}>
          <div>
            {/* Section heading, with the BSB parallel-passage refs inline */}
            <p className="font-scripture text-[1em] font-[450] italic text-gold-bright">
              The Beginning{" "}
              <span className="text-xs font-normal text-neutral-400">
                (Genesis 1:1&ndash;2; Hebrews 11:1&ndash;3)
              </span>
            </p>

            <p className="mt-3 font-scripture font-normal leading-relaxed text-neutral-300">
              {/* Chapter opens with the reader's big drop-cap numeral, which
                  stands in for verse 1's suppressed marker. */}
              <span
                onClick={() => openVerse(1)}
                title="Verse tools"
                className="float-left mr-2.5 mt-[0.08em] cursor-pointer select-none font-display text-[3.4em] font-semibold leading-[0.78] text-amber-400 transition-colors hover:text-amber-300"
              >
                1
              </span>
              {verseSpan(1, VERSES[1].bsb)}
              <VerseNum num={2} onTap={() => openVerse(2)} />{" "}
              {verseSpan(2, VERSES[2].bsb)}
              <VerseNum num={3} onTap={() => openVerse(3)} />{" "}
              {verseSpan(3, VERSES[3].bsb)}
              <VerseNum num={4} onTap={() => openVerse(4)} />{" "}
              {verseSpan(4, VERSES[4].bsb)}
              <VerseNum num={5} onTap={() => openVerse(5)} />{" "}
              {verseSpan(5, VERSES[5].bsb)}
            </p>
          </div>

          {/* Second section — shows a BSB subheading break mid-chapter, and
              gives more verses to tap. Real John 1:6-13 (BSB). */}
          <div>
            <p className="font-scripture text-[1em] font-[450] italic text-gold-bright">
              The Witness of John
            </p>
            <p className="mt-3 font-scripture font-normal leading-relaxed text-neutral-300">
              <VerseNum num={6} onTap={() => openVerse(6)} />{" "}
              {verseSpan(6, VERSES[6].bsb)}
              <VerseNum num={7} onTap={() => openVerse(7)} />{" "}
              {verseSpan(7, VERSES[7].bsb)}
              <VerseNum num={8} onTap={() => openVerse(8)} />{" "}
              {verseSpan(8, VERSES[8].bsb)}
              <VerseNum num={9} onTap={() => openVerse(9)} />{" "}
              {verseSpan(9, VERSES[9].bsb)}
              <VerseNum num={10} onTap={() => openVerse(10)} />{" "}
              {verseSpan(10, VERSES[10].bsb)}
              <VerseNum num={11} onTap={() => openVerse(11)} />{" "}
              {verseSpan(11, VERSES[11].bsb)}
              <VerseNum num={12} onTap={() => openVerse(12)} />{" "}
              {verseSpan(12, VERSES[12].bsb)}
              <VerseNum num={13} onTap={() => openVerse(13)} />{" "}
              {verseSpan(13, VERSES[13].bsb)}
            </p>
          </div>
        </div>
      </div>

      {/* Verse tools — the sheet a tap on any verse opens, inside the frame */}
      {sheetVerse !== null && (
        <MockVerseSheet
          verse={sheetVerse}
          highlight={highlights[sheetVerse] ?? null}
          note={notes[sheetVerse] ?? ""}
          onHighlight={(color) =>
            setHighlights((h) => {
              const next = { ...h };
              if (color) next[sheetVerse] = color;
              else delete next[sheetVerse];
              return next;
            })
          }
          onSaveNote={(note) =>
            setNotes((n) => {
              const next = { ...n };
              if (note) next[sheetVerse] = note;
              else delete next[sheetVerse];
              return next;
            })
          }
          onClose={() => setSheetVerse(null)}
        />
      )}
      </div>
    </div>
    </>
  );
}
