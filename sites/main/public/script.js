const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const currentInterest = document.querySelector("#currentInterest");
const interests = [
  "building little worlds with code",
  "thinking up sci-fi stories",
  "finding a new game to get lost in",
  "learning how things work",
];
const toolButtons = document.querySelectorAll("[data-tool-info]");
const toolkitNote = document.querySelector("#toolkitNote");
const languageButtons = document.querySelectorAll(".language-card");
const languagePhrase = document.querySelector("#languagePhrase");
const easterEgg = document.querySelector("#easterEgg");
const easterClose = document.querySelector(".easter-close");
const projectCard = document.querySelector(".project-card");
const discordCopyButton = document.querySelector("[data-copy-value]");
const contactStatus = document.querySelector("#contactStatus");
const copyLabel = document.querySelector("[data-copy-label]");
const copyText = document.querySelector(".copy-text") || copyLabel;

if (currentInterest && !reducedMotion.matches) {
  let interestIndex = 0;
  let interestInterval = null;

  const rotateInterest = () => {
    interestIndex = (interestIndex + 1) % interests.length;
    currentInterest.classList.remove("is-changing");
    requestAnimationFrame(() => {
      currentInterest.textContent = interests[interestIndex];
      requestAnimationFrame(() => {
        currentInterest.classList.add("is-changing");
      });
    });
  };

  const startInterestRotation = () => {
    if (!interestInterval) {
      interestInterval = window.setInterval(rotateInterest, 4200);
    }
  };

  const stopInterestRotation = () => {
    if (interestInterval) {
      window.clearInterval(interestInterval);
      interestInterval = null;
    }
  };

  currentInterest.addEventListener("animationend", () => {
    currentInterest.classList.remove("is-changing");
  });

  startInterestRotation();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopInterestRotation();
    } else {
      startInterestRotation();
    }
  });
}

for (const button of toolButtons) {
  button.addEventListener("click", () => {
    for (const tool of toolButtons) {
      const selected = tool === button;
      tool.classList.toggle("is-selected", selected);
      tool.setAttribute("aria-pressed", String(selected));
    }
    if (toolkitNote) toolkitNote.textContent = button.dataset.toolInfo ?? "";
  });
}

for (const button of languageButtons) {
  button.addEventListener("click", () => {
    for (const language of languageButtons) {
      const selected = language === button;
      language.classList.toggle("is-active", selected);
      language.setAttribute("aria-pressed", String(selected));
    }

    if (!languagePhrase) return;
    languagePhrase.classList.add("is-changing");
    window.setTimeout(() => {
      languagePhrase.textContent = button.dataset.phrase ?? "";
      languagePhrase.classList.remove("is-changing");
    }, reducedMotion.matches ? 0 : 160);
  });
}

if ("IntersectionObserver" in window && !reducedMotion.matches) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    let batchIndex = 0;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.style.setProperty("--reveal-index", String(batchIndex));
      batchIndex += 1;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.12 });

  const revealItems = document.querySelectorAll(
    ".about-heading, .about-bio, .about-details, .inspiration-card, .next-project, .contact-links, .section-heading, .project-card, .site-note",
  );
  document.documentElement.classList.add("js-enhanced");
  for (const item of revealItems) {
    item.classList.add("reveal-item");
    revealObserver.observe(item);
  }
} else {
  document.querySelectorAll(
    ".about-heading, .about-bio, .about-details, .inspiration-card, .next-project, .contact-links, .section-heading, .project-card, .site-note",
  ).forEach((item) => item.classList.add("is-visible"));
}

if (projectCard && !reducedMotion.matches) {
  let cardBounds = null;
  let rafPending = false;

  projectCard.addEventListener("pointerenter", () => {
    cardBounds = projectCard.getBoundingClientRect();
  });

  projectCard.addEventListener("pointermove", (event) => {
    if (!cardBounds || rafPending) return;
    const { clientX, clientY } = event;
    rafPending = true;
    requestAnimationFrame(() => {
      projectCard.style.setProperty("--pointer-x", `${clientX - cardBounds.left}px`);
      projectCard.style.setProperty("--pointer-y", `${clientY - cardBounds.top}px`);
      rafPending = false;
    });
  });

  projectCard.addEventListener("pointerleave", () => {
    cardBounds = null;
    projectCard.style.removeProperty("--pointer-x");
    projectCard.style.removeProperty("--pointer-y");
  });

  const updateCardBounds = () => {
    if (cardBounds) {
      cardBounds = projectCard.getBoundingClientRect();
    }
  };
  window.addEventListener("resize", updateCardBounds, { passive: true });
  window.addEventListener("scroll", updateCardBounds, { passive: true });
}

discordCopyButton?.addEventListener("click", async () => {
  const handle = discordCopyButton.dataset.copyValue;
  if (!handle || !contactStatus || !copyLabel) return;

  try {
    if (!navigator.clipboard?.writeText) {
      contactStatus.textContent = "Copy isn’t available here—Discord handle: @filiposakkq";
      contactStatus.classList.add("is-error");
      return;
    }

    await navigator.clipboard.writeText(handle);
    contactStatus.textContent = "Discord handle copied.";
    contactStatus.classList.remove("is-error");
    contactStatus.classList.add("is-success");
    copyText.textContent = "COPIED ";
    window.setTimeout(() => {
      contactStatus.textContent = "";
      contactStatus.classList.remove("is-success");
      contactStatus.classList.remove("is-error");
      copyText.textContent = "COPY ";
    }, 2200);
  } catch (error) {
    contactStatus.textContent = "Could not copy—Discord handle: @filiposakkq";
    contactStatus.classList.remove("is-success");
    contactStatus.classList.add("is-error");
    console.error("Unable to copy Discord handle.", error);
  }
});

let typedSequence = "";
let sequenceTimer;
let logoTapCount = 0;
let logoTapTimer;

function openEasterEgg() {
  if (!easterEgg) return;
  if (typeof easterEgg.showModal === "function") easterEgg.showModal();
  else easterEgg.setAttribute("open", "");
}

document.addEventListener("keydown", (event) => {
  if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;

  typedSequence = `${typedSequence}${event.key.toLowerCase()}`.slice(-8);
  window.clearTimeout(sequenceTimer);
  sequenceTimer = window.setTimeout(() => { typedSequence = ""; }, 1800);

  if (typedSequence.endsWith("fsociety")) {
    typedSequence = "";
    openEasterEgg();
  }
});

document.querySelector(".wordmark")?.addEventListener("click", () => {
  logoTapCount += 1;
  window.clearTimeout(logoTapTimer);
  if (logoTapCount >= 7) {
    logoTapCount = 0;
    openEasterEgg();
  } else {
    logoTapTimer = window.setTimeout(() => { logoTapCount = 0; }, 2600);
  }
});

easterClose?.addEventListener("click", () => easterEgg?.close());
easterEgg?.addEventListener("click", (event) => {
  if (event.target === easterEgg) easterEgg.close();
});
