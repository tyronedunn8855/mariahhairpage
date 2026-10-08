#!/usr/bin/env python3
"""Builds the static service menu inside index.html.

Edit SERVICES below (prices, deposits, durations, descriptions), then run:
    python3 scripts/build_menu.py
It rewrites everything between <!-- MENU:START --> and <!-- MENU:END -->.
The menu is plain HTML so it shows even if JavaScript fails; main.js only
adds filtering, search and the detail sheet on top of it.

Source of truth: her Square booking page (checked Oct 8 2026).
"""
import html
import re
from pathlib import Path

CATS = [
    ("new", "New Clients + Consultation", "First time in the chair? Start here."),
    ("healthy", "Healthy Hair Collection", "Silk presses, wash days and natural styling."),
    ("weave", "Quick Weaves", "Hair is not included."),
    ("pony", "Ponytails", "Extension hair is not included."),
    ("braids", "Braids", "Starting prices include mid-back length."),
    ("color", "Color Experience", "Established clients only. Finished style books separately."),
    ("addons", "Add-Ons", "Please read for all appointments. Add-ons attach to an eligible service."),
]

# (category, name, price, deposit, duration, description paragraphs)
# price: "$85" fixed, "$65+" starting price (her "+" convention).
# deposit: "$20", None = no deposit listed on Square, "addon" = add-on (no deposit field).
SERVICES = [
    ("new", "New Client Healthy Hair Experience", "$85", "$25", "1 hr 30 min", [
        "First time at Mar Latrice Styles? Start here. This service introduces me to your hair, your routine, your concerns and your healthy-hair goals.",
        "Includes an in-person hair and scalp assessment, consultation, shampoo, conditioning treatment, trim and blow dry. We go through your hair history, current concerns and home-care routine.",
        "<strong>Styling is not included.</strong> A styling service books separately.",
    ]),
    ("new", "In-Person Hair Consultation", "$20", "$20, paid at booking", "30 min", [
        "Not sure what to book? Come in for a professional assessment of your hair and scalp. We cover your hair history, current concerns, goals, maintenance routine and which services fit.",
        "This appointment does not include shampoo, treatment or styling.",
        "<strong>Color consultations follow a separate process, and color services are for established clients only.</strong>",
    ]),
    ("healthy", "Signature Silk Press", "$85", "$20", "1 hr 30 min", [
        "The Mar Latrice signature. A healthy-hair focused silk press that leaves your hair clean, smooth, bouncy and full of movement.",
        "Includes shampoo, conditioning, blow dry, silk press and trim. Trims up to 1 inch are included. More than 1 inch counts as a haircut and adds $15+.",
        "Extra long or dense hair may need extra time and an applicable add-on.",
    ]),
    ("healthy", "Luxe Silk Press", "$110", "$20", "2 hr 15 min", [
        "Your Signature Silk Press with extra care for hair that needs hydration, restoration and more attention.",
        "Includes shampoo, a customized deep-conditioning or hydration treatment, scalp care, blow dry, silk press and trim. The treatment is chosen based on the condition of your hair that day.",
        "Trims up to 1 inch are included. More than 1 inch adds $15+.",
    ]),
    ("healthy", "Silk Press Maintenance", "$65", "$20", "1 hr", [
        "Refreshes and extends a Mar Latrice Styles silk press. Includes shampoo, conditioning, blow dry and restyling, with a trim when needed.",
        "For established clients maintaining a recent silk press. It does not replace the Signature Silk Press when your hair needs the full service.",
    ]),
    ("healthy", "Wash + Blow Dry", "$50", "$20", "1 hr", [
        "Sometimes your hair needs a reset. Includes a thorough shampoo, conditioning, detangling and blow dry.",
        "<strong>No finished style is included.</strong>",
    ]),
    ("healthy", "Just a Style!", "$45", "$20", "1 hr", [
        "Already washed and only need the finish? Choose a flat-iron finish or curls on clean, dry, previously blow-dried hair.",
        "<strong>Shampoo, conditioning and blow dry are not included.</strong> Hair that needs cleansing or heavy detangling changes to the right service, depending on availability.",
    ]),
    ("healthy", "Refresh + Reset", "$65+", "$20", "3 hr", [
        "Let me handle the part nobody wants to do. Professional takedown of your protective style, followed by detangling, shampoo, conditioning and blow dry.",
        "Pricing starts at $65 and depends on the style being removed, length, buildup, matting and takedown time. <strong>Finished styling is not included.</strong>",
    ]),
    ("healthy", "Natural Style", "$75+", "$20", "3 hr", [
        "A wash-and-style appointment for clients wearing their natural texture: two-strand twists, flat twists, braid styles and similar looks.",
        "Pricing and timing depend on length, density and the style you pick, so include your desired style when booking. <strong>Added hair is not included.</strong>",
    ]),
    ("weave", "Classic Quick Weave", "$100", "$20", "2 hr 30 min", [
        "A traditional quick weave customized to the look you want. Includes shampoo, conditioning, blow dry, braid down, protective molding, installation, cut and finished style.",
        "<strong>Hair is not included.</strong>",
    ]),
    ("weave", "Flip-Over Quick Weave", "$115", "$20", "3 hr", [
        "A versatile, natural-looking quick weave built for flexible parting and easy volume. Includes shampoo, conditioning, blow dry, braid down, protective molding, installation, blending, cut and finished style.",
        "<strong>Hair is not included.</strong>",
    ]),
    ("weave", "Half Up/Half Down Quick Weave", "$125", "$20", "3 hr", [
        "A polished half-up, half-down install pairing a sleek upper style with a full quick weave in the back. Includes shampoo, conditioning, blow dry, braid down, protective molding, installation and finished style.",
        "<strong>Hair is not included.</strong>",
    ]),
    ("weave", "Quick Weave w/ Natural Hair Braids", "$125+", "$20", "3 hr 30 min", [
        "A quick weave paired with braids in your natural hair. Includes the wash, braid down, install and finished style.",
        "<strong>Hair is not included.</strong> Final pricing depends on braid work and time.",
    ]),
    ("pony", "Sleek Ponytail", "$100", "$20", "2 hr 15 min", [
        "A sleek, polished ponytail at the placement you want: high, mid or low. Includes shampoo, conditioning, blow dry, molding, ponytail installation and finished style.",
        "<strong>Extension hair is not included.</strong>",
    ]),
    ("pony", "Ponytail w/ Bang(s)", "$110", None, "2 hr 30 min", [
        "A sleek ponytail paired with a customized bang. Includes shampoo, conditioning, blow dry, molding, ponytail installation, bang customization and finished style.",
        "<strong>Extension hair is not included.</strong>",
    ]),
    ("braids", "Jumbo Knotless", "$125+", "$25", "4 hr", [
        "A bold knotless install with larger sections for a lightweight, polished protective style.",
        "Starting price includes <strong>mid-back length</strong>. Longer lengths and specialty finishes cost more.",
    ]),
    ("braids", "Large Knotless", "$200+", "$25", "5 hr", [
        "A full knotless install with large sections for a clean, lightweight style.",
        "Starting price includes <strong>mid-back length</strong>. Longer lengths and specialty finishes cost more.",
    ]),
    ("braids", "Medium Knotless", "$275+", "$25", "6 hr 30 min", [
        "A full medium knotless install that balances fullness, versatility and longevity.",
        "Starting price includes <strong>mid-back length</strong>. Longer lengths and specialty finishes cost more.",
    ]),
    ("braids", "Smedium Knotless", "$325+", None, "7 hr 30 min", [
        "Smaller, more detailed sections than medium for added fullness and styling range.",
        "Starting price includes <strong>mid-back length</strong>. Longer lengths and specialty finishes cost more.",
    ]),
    ("braids", "Small Knotless", "$375+", "$25", "8 hr 30 min", [
        "The most detailed knotless install on the menu, with the smallest sections.",
        "Starting price includes <strong>mid-back length</strong>. Longer lengths and specialty finishes cost more.",
    ]),
    ("color", "Root Retouch", "$35+", "$15", "1 hr", [
        "Refreshes up to two inches of new growth to maintain an existing single-process color. Includes color application, processing, shampoo and conditioning treatment.",
        "<strong>For existing color maintenance only.</strong> Major color changes or more than two inches of regrowth need a different color service. Finished style books separately.",
    ]),
    ("color", "Gloss + Tone", "$60+", "$20", "30 min", [
        "A color refresh that enhances tone, restores richness and shine, or refines previously colored hair. Good between larger color appointments.",
        "Includes application, processing, shampoo and conditioning. Finished style books separately.",
    ]),
    ("color", "Single Process Color", "$75+", "$20", "1 hr 30 min", [
        "An all-over color service that deepens, refreshes or enhances your color in one process. Includes customized formulation, application, processing, shampoo and deep conditioning treatment.",
        "Pricing depends on length, density and product used. Finished style books separately.",
    ]),
    ("color", "Partial Highlights", "$100+", "$20", "2 hr", [
        "Placed highlights that add brightness, dimension and movement while keeping depth through the hair. Includes lightener, customized toner, shampoo and deep conditioning treatment.",
        "Pricing depends on placement, density and product used. Finished style books separately.",
    ]),
    ("color", "Full Highlights", "$125+", "$20", "2 hr", [
        "A full-head highlighting service that builds brightness and dimension throughout. Includes customized placement, lightener, toner, shampoo and deep conditioning treatment.",
        "Additional product or corrective work raises the price. Finished style books separately.",
    ]),
    ("color", "Signature Blonding", "$125", "$20", "2 hr", [
        "A customized lightening service for an all-over blonde or a significantly lighter result. Includes lightener application, customized toner, shampoo and deep conditioning treatment.",
        "<strong>The price reflects one lightening session.</strong> More sessions may be needed to reach your result safely. Finished style books separately.",
    ]),
    # TY: PRICE CONFLICT. Her Square title says "from $100" for Color Correction,
    # but her own description says "$150 is the starting price". We show $100+
    # exactly as the title reads. Ask Mariah which is right before launch.
    ("color", "Color Correction (by request only)", "$100+", "$20", "2 hr 30 min", [
        "Corrective color for previously colored hair that needs major tonal adjustment, removal of unwanted color, evening out, banding fixes or other specialized work.",
        "<strong>The starting price is not a guaranteed total.</strong> Final pricing and the service plan are set after consultation, based on hair history, condition, your goal and the processes required. More than one appointment may be needed.",
    ]),
    ("addons", "Haircut / Major Trim", "$20+", "addon", "30 min", [
        "For hair that needs more than the maintenance trim included with select Healthy Hair services: extra shaping or removal beyond about one inch.",
        "Signature and Luxe Silk Press already include your regular trim. This one is for “girl, these ends need to GO.”",
        "<strong>Must be added to an eligible service.</strong>",
    ]),
    ("addons", "Detailed Styling", "$20", "addon", "30 min", [
        "For styling that needs more time than the standard finish included with your service: detailed curls, crimps and specialty finishing. Signature curls are already included in all complete hair services.",
    ]),
    ("addons", "Long / Dense Hair", "$15", "addon", "30 min", [
        "Added when extra length or density needs significantly more product, detangling, drying or styling time.",
    ]),
    ("addons", "Deep Conditioning Treatment", "$20", "addon", "30 min", [
        "A moisture-focused conditioning treatment customized to replenish hydration, softness and manageability.",
    ]),
    ("addons", "Strengthening Treatment", "$25", "addon", "30 min", [
        "A strengthening treatment for hair showing weakness, excessive shedding or breakage, chosen based on what your hair needs that day.",
        "<strong>Must be added to an eligible shampoo service.</strong>",
    ]),
    ("addons", "Scalp Detox Treatment", "$25", "addon", "30 min", [
        "A targeted scalp treatment that removes excess buildup and creates a balanced foundation for healthy hair.",
        "<strong>Must be added to an eligible shampoo service.</strong>",
    ]),
]


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def deposit_text(d):
    if d == "addon":
        return "Add-on"
    if d is None:
        return "No deposit listed"
    return f"Deposit {d}"


def build():
    out = []
    for n, (cid, cname, cnote) in enumerate(CATS, 1):
        items = [s for s in SERVICES if s[0] == cid]
        out.append(f'<section class="cat" data-cat="{cid}" aria-labelledby="cat-{cid}">')
        out.append('  <header class="cat-head">')
        out.append(f'    <h3 id="cat-{cid}"><span class="cat-no">{n:02d}</span> {html.escape(cname)}</h3>')
        out.append(f'    <p class="cat-note">{html.escape(cnote)}</p>')
        out.append('  </header>')
        out.append('  <ol class="svc-list">')
        for _, name, price, dep, dur, desc in items:
            sid = slug(name)
            body = "".join(f"<p>{p}</p>" for p in desc)
            out.append(f'    <li class="svc" id="svc-{sid}" data-name="{html.escape(name)}">')
            out.append(f'      <button type="button" class="svc-btn" aria-haspopup="dialog" data-svc="{sid}">')
            out.append(f'        <span class="svc-name">{html.escape(name)}</span>')
            out.append('        <span class="svc-lead" aria-hidden="true"></span>')
            out.append(f'        <span class="svc-price">{price}</span>')
            out.append(f'        <span class="svc-meta"><span>{deposit_text(dep)}</span><span class="plus" aria-hidden="true">+</span><span>{dur}</span></span>')
            out.append('      </button>')
            out.append(f'      <div class="svc-desc">{body}</div>')
            out.append('    </li>')
        out.append('  </ol>')
        out.append('</section>')
    return "\n".join(out)


def main():
    p = Path(__file__).resolve().parent.parent / "index.html"
    src = p.read_text()
    block = build()
    new = re.sub(r"(<!-- MENU:START -->)(.*?)(<!-- MENU:END -->)",
                 lambda m: m.group(1) + "\n" + block + "\n" + m.group(3), src, flags=re.S)
    p.write_text(new)
    print(f"menu rebuilt: {len(SERVICES)} services in {len(CATS)} categories")


if __name__ == "__main__":
    main()
