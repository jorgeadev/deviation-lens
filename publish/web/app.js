const STORE_URL = ""; // Add the published Chrome Web Store item URL here.

document.querySelector("#year").textContent = new Date().getFullYear();
if (STORE_URL) {
  document.querySelectorAll(".store-link").forEach((link) => {
    link.href = STORE_URL;
    link.removeAttribute("aria-disabled");
    if (link.tagName === "A") link.target = "_blank";
  });
  const status = document.querySelector(".install-status");
  if (status) status.textContent = "Available in the Chrome Web Store.";
  const heroButton = document.querySelector(".hero .button");
  if (heroButton) heroButton.textContent = "Add to Chrome";
  const installButton = document.querySelector(".install-section .button");
  if (installButton) installButton.textContent = "Get Deviation Lens";
}
