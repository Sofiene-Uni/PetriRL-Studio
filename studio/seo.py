"""What search engines and link previews see: one entry per content page and language.
Edit titles and descriptions here; the page text itself is in templates/pages/<lang>/<page>.html."""

PAGES = ("home", "technology", "about", "contact", "privacy")      # pages with their own address, in the sitemap

META = {
    "en": {
        "home": ("PetriRL | Discrete optimization with AI, heuristics and metaheuristics",
                 "Plan your production with AI agents trained by reinforcement learning, dispatching rules and "
                 "metaheuristics on a light digital twin, a colored timed Petri net. Free demonstrator from "
                 "research at FH SWF."),
        "technology": ("Technology | PetriRL",
                       "The research behind PetriRL: papers and open-source code on Petri nets and reinforcement "
                       "learning for job shop scheduling, intralogistics, dynamic scheduling and action masking."),
        "about": ("About | PetriRL", "PetriRL Studio: how it works, the team, how to cite it and the source code."),
        "contact": ("Contact | PetriRL", "Contact, license and research cooperation for PetriRL Studio."),
        "privacy": ("Privacy | PetriRL", "Privacy notice and site operator of the PetriRL Studio demonstrator."),
    },
    "de": {
        "home": ("PetriRL | Diskrete Optimierung mit KI, Heuristiken und Metaheuristiken",
                 "Planen Sie Ihre Produktion mit KI-Agenten (Reinforcement Learning), Prioritätsregeln und "
                 "Metaheuristiken auf einem schlanken digitalen Zwilling, einem farbigen zeitbehafteten Petri-Netz. "
                 "Kostenloser Demonstrator aus der Forschung der FH SWF."),
        "technology": ("Technologie | PetriRL",
                       "Die Forschung hinter PetriRL: Veröffentlichungen und Open-Source-Code zu Petri-Netzen und "
                       "Reinforcement Learning für Werkstattfertigung, Intralogistik, dynamische Planung und "
                       "Aktionsmaskierung."),
        "about": ("Über | PetriRL", "PetriRL Studio: Funktionsweise, Team, Zitation und Quellcode."),
        "contact": ("Kontakt | PetriRL", "Kontakt, Lizenz und Forschungskooperation für PetriRL Studio."),
        "privacy": ("Datenschutz | PetriRL", "Datenschutzerklärung und Anbieter des Demonstrators PetriRL Studio."),
    },
}


def path(page, lang):
    """URL path of a content page: /technology, /de/technology; home is / and /de/."""
    prefix = "" if lang == "en" else f"/{lang}"
    return f"{prefix}/" if page == "home" else f"{prefix}/{page}"
