// Styled replacement for a native <select>, following the ARIA select-only combobox pattern.
(() => {
	let nextId = 0;

	// options: [{ value, label, hint }]. Returns { setValue } for updating the selection from outside.
	function createDropdown(host, { labelledBy, options, value, onChange }) {
		const listId = `dropdown-list-${++nextId}`;
		const button = document.createElement("button");
		button.type = "button";
		button.className = "dropdownButton";
		button.setAttribute("role", "combobox");
		button.setAttribute("aria-haspopup", "listbox");
		button.setAttribute("aria-expanded", "false");
		button.setAttribute("aria-controls", listId);
		if (labelledBy) button.setAttribute("aria-labelledby", labelledBy);
		const current = document.createElement("span");
		current.className = "dropdownValue";
		button.appendChild(current);

		const list = document.createElement("ul");
		list.id = listId;
		list.className = "dropdownList hidden";
		list.setAttribute("role", "listbox");
		if (labelledBy) list.setAttribute("aria-labelledby", labelledBy);

		const items = options.map((option, index) => {
			const item = document.createElement("li");
			item.id = `${listId}-${index}`;
			item.className = "dropdownOption";
			item.setAttribute("role", "option");
			const label = document.createElement("span");
			label.className = "dropdownLabel";
			label.textContent = option.label;
			item.appendChild(label);
			if (option.hint) {
				const hint = document.createElement("span");
				hint.className = "dropdownHint";
				hint.textContent = option.hint;
				item.appendChild(hint);
			}
			item.addEventListener("mousemove", () => setActive(index));
			// Keeps focus on the button, which owns the keyboard handling.
			item.addEventListener("mousedown", (event) => event.preventDefault());
			item.addEventListener("click", () => choose(index));
			list.appendChild(item);
			return item;
		});

		host.classList.add("dropdown");
		host.append(button, list);

		let selected = 0;
		let active = 0;
		const isOpen = () => button.getAttribute("aria-expanded") === "true";

		function setActive(index) {
			active = index;
			items.forEach((item, i) => {
				item.classList.toggle("active", i === index);
			});
			button.setAttribute("aria-activedescendant", items[index].id);
			items[index].scrollIntoView({ block: "nearest" });
		}

		function setSelected(index) {
			selected = index;
			current.textContent = options[index].label;
			items.forEach((item, i) => {
				item.setAttribute("aria-selected", String(i === index));
			});
		}

		function open() {
			list.classList.remove("hidden");
			button.setAttribute("aria-expanded", "true");
			setActive(selected);
		}

		function close() {
			list.classList.add("hidden");
			button.setAttribute("aria-expanded", "false");
			button.removeAttribute("aria-activedescendant");
		}

		function choose(index) {
			const changed = index !== selected;
			setSelected(index);
			close();
			if (changed) onChange(options[index].value);
		}

		button.addEventListener("click", () => {
			if (isOpen()) close();
			else open();
		});

		button.addEventListener("keydown", (event) => {
			const { key } = event;
			if (!isOpen()) {
				if (["ArrowDown", "ArrowUp", "Enter", " "].includes(key)) {
					event.preventDefault();
					open();
				}
				return;
			}
			if (key === "Tab") {
				close();
				return;
			}
			const moves = {
				ArrowDown: Math.min(active + 1, items.length - 1),
				ArrowUp: Math.max(active - 1, 0),
				Home: 0,
				End: items.length - 1,
			};
			if (key in moves) setActive(moves[key]);
			else if (key === "Enter" || key === " ") choose(active);
			else if (key === "Escape") close();
			else return;
			event.preventDefault();
		});

		button.addEventListener("blur", close);

		function setValue(next) {
			const index = options.findIndex((option) => option.value === next);
			setSelected(index < 0 ? 0 : index);
		}

		setValue(value);
		return { setValue };
	}

	globalThis.DeviationLens = globalThis.DeviationLens || {};
	globalThis.DeviationLens.createDropdown = createDropdown;
})();
