const STORE_URL = ""; // Set the published Chrome Web Store item URL here.

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
	if (status) status.textContent = "Available in the Chrome Web Store. You can also install the alpha from source.";
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

const demoStage = document.querySelector("#demo-stage");
if (demoStage) {
	const examples = [
		{ id: "forest", title: "Still water", dimensions: "3840 × 2160", format: "PNG", size: "8.2 MB", label: "max", image: "forest.svg" },
		{ id: "mountains", title: "First light", dimensions: "2560 × 1440", format: "JPG", size: "3.4 MB", label: "max", image: "mountains.svg" },
		{ id: "coast", title: "Along the coast", dimensions: "1920 × 1080", format: "JPG", size: "1.9 MB", label: "max", image: "coast.svg" },
		{
			id: "explore",
			title: "Explore recommendation",
			dimensions: "1280 × 960",
			format: "JPG",
			size: "920 KB",
			label: "Explore",
			image: "mountains.svg",
			explore: true,
		},
	];
	let scene = "gallery";
	const selected = new Set(examples.map((image) => image.id));
	const exploreInput = document.querySelector("#demo-explore");
	const results = document.querySelector("#demo-results");
	const sidebarToggle = document.querySelector("#demo-sidebar-toggle");
	const aside = document.querySelector("#demo-aside");
	const visibleExamples = () => examples.filter((image) => (image.explore ? exploreInput.checked : scene === "gallery" || image.id === "forest"));

	function updateSelection() {
		const count = visibleExamples().filter((image) => selected.has(image.id)).length;
		document.querySelector("#demo-selection").textContent = `${count} selected`;
	}

	function renderDemo() {
		const images = visibleExamples();
		results.replaceChildren();
		images.forEach((image) => {
			const row = document.createElement("label");
			row.className = `demo-result${image.explore ? " explore-result" : ""}`;
			const input = document.createElement("input");
			input.type = "checkbox";
			input.checked = selected.has(image.id);
			input.setAttribute("aria-label", `Select ${image.title}`);
			input.addEventListener("change", () => {
				if (input.checked) selected.add(image.id);
				else selected.delete(image.id);
				updateSelection();
			});
			const thumbnail = document.createElement("img");
			thumbnail.src = `assets/${image.image}`;
			thumbnail.alt = "";
			thumbnail.width = 34;
			thumbnail.height = 37;
			const meta = document.createElement("div");
			const dimensions = document.createElement("b");
			dimensions.textContent = image.dimensions;
			const details = document.createElement("small");
			const badge = document.createElement("span");
			badge.className = "quality-chip";
			badge.textContent = image.label;
			details.append(badge, document.createTextNode(`${image.format}  ${image.size}`));
			meta.append(dimensions, details);
			row.append(input, thumbnail, meta);
			results.append(row);
		});
		document.querySelector("#demo-summary").textContent = images.length + (images.length === 1 ? " image found" : " images found");
		document.querySelector("#explore-state").textContent = exploreInput.checked ? "Included in results" : "Excluded from results";
		demoStage.classList.toggle("explore-included", exploreInput.checked);
		updateSelection();
	}

	function setSidebar(open) {
		demoStage.classList.toggle("sidebar-closed", !open);
		sidebarToggle.setAttribute("aria-expanded", String(open));
		sidebarToggle.textContent = open ? "Close sidebar" : "Open sidebar";
		aside.inert = !open;
		aside.setAttribute("aria-hidden", String(!open));
	}

	sidebarToggle.addEventListener("click", () => setSidebar(sidebarToggle.getAttribute("aria-expanded") !== "true"));
	document.querySelector("#demo-close").addEventListener("click", () => {
		setSidebar(false);
		sidebarToggle.focus();
	});
	exploreInput.addEventListener("change", renderDemo);
	document.querySelectorAll(".scene-tab").forEach((tab) => {
		tab.addEventListener("click", () => {
			scene = tab.dataset.scene;
			demoStage.classList.toggle("artwork-view", scene === "artwork");
			document.querySelectorAll(".scene-tab").forEach((button) => {
				const active = button === tab;
				button.classList.toggle("active", active);
				button.setAttribute("aria-pressed", String(active));
			});
			renderDemo();
		});
	});
	document.querySelector("#demo-best").addEventListener("click", () => {
		selected.clear();
		selected.add(visibleExamples()[0].id);
		renderDemo();
	});
	renderDemo();
}
