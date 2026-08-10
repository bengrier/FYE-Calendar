/* Submissions travel as links.

   There is no server here and no third-party form: a submission is encoded
   into the URL itself, the submitter sends that link to the office, and the
   review queue decodes it back into a submission when the link is opened.
   Nothing is stored anywhere in between, nothing has to be licensed, and there
   is no public endpoint for anyone to abuse.

   The one thing a link cannot carry is the flyer, so the prefilled email asks
   the submitter to attach it. That is not a workaround for the lack of a
   server — email attachments are the transport every submitter already has,
   and the office has to put the artwork in `flyers/` at approval time either
   way.

   This is not a security boundary and is not trying to be. Anyone who reads
   this file can hand-craft a submission link, which buys them a card in a queue
   that a human still has to approve. */
window.CalSubmission = (function () {
  "use strict";

  /* Bumped if the field set changes in a way that would make an old link
     decode into the wrong shape. Links are short-lived by nature — someone
     sends one and it is reviewed the same week — so a rejected old link is a
     better outcome than a silently mangled submission. */
  var VERSION = 1;

  /* Written out in full rather than JSON.stringify'ing the whole submission:
     a link should carry what the reviewer needs and nothing accidental, and
     the short keys keep it comfortably inside every practical URL limit. */
  var FIELDS = {
    t: "title",
    o: "org",
    p: "place",
    d: "date",
    s: "start",
    m: "time",
    b: "blurb",
    g: "tags",
    n: "newTags",
    r: "repeat",
    u: "repeatUntil",
    y: "by",
    e: "email"
  };

  /* base64url: the standard alphabet's "+" and "/" are legal in a fragment but
     survive copy-paste through mail clients and chat badly, and "=" invites
     something to truncate it. */
  function toBase64Url(str) {
    var b64 = window.btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function fromBase64Url(str) {
    var b64 = String(str).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    return decodeURIComponent(escape(window.atob(b64)));
  }

  function encode(sub) {
    var packed = { v: VERSION };
    Object.keys(FIELDS).forEach(function (key) {
      var value = sub[FIELDS[key]];
      /* Empty values are simply absent rather than encoded as empty strings —
         it is a shorter link and decode fills them back in. */
      if (value === null || value === undefined || value === "") return;
      if (Array.isArray(value) && !value.length) return;
      packed[key] = value;
    });
    return toBase64Url(JSON.stringify(packed));
  }

  /* Returns null for anything that is not a submission this version wrote.
     Every caller treats null as "that link is not readable" and says so,
     rather than opening a half-populated review card. */
  function decode(payload) {
    var packed;
    try {
      packed = JSON.parse(fromBase64Url(payload));
    } catch (e) {
      return null;
    }
    if (!packed || packed.v !== VERSION) return null;

    var sub = {};
    Object.keys(FIELDS).forEach(function (key) {
      sub[FIELDS[key]] = packed[key];
    });

    /* The fields the queue and the publisher read unconditionally. A link
       missing any of them was not written by the submit form. */
    if (!sub.title || !sub.org || !sub.place || !sub.date || !sub.time ||
        !sub.blurb || !sub.by || !sub.email) {
      return null;
    }

    sub.tags = sub.tags || [];
    sub.newTags = sub.newTags || [];
    sub.repeat = sub.repeat || "";
    sub.repeatUntil = sub.repeatUntil || null;
    sub.start = typeof sub.start === "number" ? sub.start : 0;
    sub.flyer = null;
    sub.flyerImage = null;

    return sub;
  }

  /* An absolute link, because this is going into an email — the office has to
     be able to click it from Outlook, not resolve it against wherever they
     happen to be. */
  function linkFor(sub) {
    var base = location.href.split("#")[0];
    return base + "#review/" + encode(sub);
  }

  function office() {
    return (window.CalData.CONFIG || {}).office || {};
  }

  function configured() {
    return !!String(office().email || "").trim();
  }

  /* The submitter's own covering email. It carries the link, and it carries
     the flyer as an attachment, which is the whole reason this is an email
     and not just a copied link. */
  function mailtoFor(sub, link) {
    var to = String(office().email || "").trim();

    var body = [
      "Hello,",
      "",
      "I would like to put this on the First-Year Engineering Calendar:",
      "",
      "  " + sub.title,
      "  " + sub.org,
      "  " + window.CalDates.longDayLabel(sub.date) + ", " + sub.time,
      "  " + sub.place,
      "",
      "The submission link is below — opening it loads everything into the",
      "review queue, so nothing has to be retyped.",
      "",
      link,
      "",
      "*** Please attach the flyer to this email before sending. ***",
      "A one-page PDF or image. Delete this line if there is no flyer.",
      "",
      "Thanks,",
      sub.by,
      sub.email
    ].join("\r\n");

    return "mailto:" + to +
      "?subject=" + encodeURIComponent("Calendar submission: " + sub.title) +
      "&body=" + encodeURIComponent(body);
  }

  return {
    VERSION: VERSION,
    encode: encode,
    decode: decode,
    linkFor: linkFor,
    mailtoFor: mailtoFor,
    office: office,
    configured: configured
  };
})();
