const STORE_URL = "https://chromewebstore.google.com/detail/deviation-lens/gkcejfnaghdbhhggjndkhpnfajnfpigc";

const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();

if (STORE_URL) {
	document.querySelectorAll(".store-link").forEach((link) => {
		link.href = STORE_URL;
		link.target = "_blank";
		link.rel = "noopener noreferrer";
		link.removeAttribute("download");
		link.textContent = "Add to Chrome";
	});
	const status = document.querySelector(".install-status");
	if (status) status.textContent = "Install Deviation Lens from the Chrome Web Store. The extension is free, and its source is available on GitHub.";
}

const menuToggle = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#main-nav");
if (menuToggle && navigation) {
	const closeMenu = () => {
		navigation.classList.remove("open");
		menuToggle.setAttribute("aria-expanded", "false");
		menuToggle.setAttribute("aria-label", "Open navigation");
	};
	menuToggle.addEventListener("click", () => {
		const open = menuToggle.getAttribute("aria-expanded") !== "true";
		navigation.classList.toggle("open", open);
		menuToggle.setAttribute("aria-expanded", String(open));
		menuToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
	});
	navigation.addEventListener("click", (event) => {
		if (event.target.closest("a")) closeMenu();
	});
	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
			closeMenu();
			menuToggle.focus();
		}
	});
}
