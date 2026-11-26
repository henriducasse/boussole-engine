# SPEC.md : spécification mécanique du moteur

Spécification des règles implémentées par le moteur, sous forme mécanique : seuils, fenêtres, conditions d'invalidation. Chaque mécanisme porte un identifiant (`ruleId`), repris dans le code (`@ruleRef`), dans [`RULES.md`](RULES.md) et dans les fixtures.

Le format des entrées/sorties (`EngineInput`, `EngineOutput`, codes `reason`/`warning`) est défini dans [`docs/contrat-moteur.md`](docs/contrat-moteur.md) ; cette page décrit la logique de décision.

> ⚠️ Document technique d'audit. Ce n'est ni un avis médical ni un matériel d'apprentissage de la méthode : celle-ci s'acquiert auprès d'une conseillère qualifiée de la méthode.

Principes généraux :

- **Fail-safe** : toute donnée manquante ou douteuse réduit les phases infertiles, jamais l'inverse.
- Un jour **exclu** (perturbation signalée par l'utilisatrice) est traité comme **absent** pour le calcul (`D-EXCL`).
- Le moteur ne devine jamais : en cas de doute, `evaluable: false`.

---

## 1. Préparation des données (`T-ROUND`, plages, `S-START`)

1. **Arrondi** : chaque température est arrondie au multiple de 0,05 °C le plus proche (`T-ROUND`).
2. **Plages plausibles** : température 35,0 à 38,5 °C ; glaire 0 à 4 ; col : ouverture 0 à 2, fermeté 0 à 1. Hors plage ⇒ `InputError`. Cycle > 99 jours ⇒ `warning cycle_too_long`, pas de rejet.
3. **Début de cycle** (`S-START`) : premier jour de saignement ≥ *léger* (`bleeding.value >= 1`), sans saignement non exclu les 2 jours précédents. Le spotting (valeur 0) ne démarre pas un cycle.
4. **Ligne du temps** : les jours sont consécutifs ; un jour sans observation est présent avec ses champs absents. « Aujourd'hui » n'existe pas dans le moteur : c'est un jour du cycle non encore saisi.

## 2. Hausse de température (phase post-ovulatoire, 1er signe)

### 2.1 Ligne de base (LTL, `T-LTL`, `D-GAP-LTL`)

- LTL d'un jour `d` = **maximum des 6 températures valables** relevées avant `d`, en remontant à travers les jours manquants/exclus.
- Ces 6 relevés doivent tenir dans les `ltlWindowMaxDays` derniers jours calendaires (paramètre, défaut **9**), donc au plus 3 jours sans relevé.
- Moins de 6 relevés dans la fenêtre : pas de ligne, `evaluable: false`, `reason insufficient_low_readings`.

### 2.2 Candidat et décompte

Un relevé devient **premier point haut** (J1 du décompte) s'il dépasse **strictement** la LTL. Le décompte suit une des trois règles :

| Règle | Jour 1 | Jour 2 | Jour 3 | Jour 4 |
|-------|--------|--------|--------|--------|
| `T-STD` | > LTL | > LTL | > LTL et ≥ LTL + 0,20 °C | non lu |
| `T-EX1` | > LTL | > LTL | > LTL mais < LTL + 0,20 °C | > LTL |
| `T-EX2` | > LTL | non lu | **exactement un** des jours 2 et 3 est ≤ LTL | ≥ LTL + 0,20 °C |

- Les trois premiers jours suffisent pour conclure une hausse standard ; le 4ᵉ jour n'est lu que pour `T-EX1` / `T-EX2`. Dans `T-EX2`, deux jours ≤ LTL (ou aucun) écartent le décompte.
- La hausse est **confirmée** au jour qui satisfait la dernière colonne : ce jour est le jour de validation ; la phase post-ovulatoire couvre ensuite le reste du cycle (sous réserve de `X-POST`, §6).

### 2.3 Fenêtre de confirmation stricte (`D-GAP-CONF`)

Entre J1 du décompte et le jour de validation (J+1 à J+3/J+4), **tout jour manquant ou exclu** écarte le décompte (`reason gap_in_confirmation_window`). La fenêtre ne se rattrape pas.

### 2.4 Valeurs suspectes (`D-OUTLIER`)

Un pic isolé **en phase basse** (avant le premier point haut d'une hausse confirmée) produit un `warning possible_outlier_temperature`. Le moteur n'exclut jamais automatiquement : c'est à l'utilisatrice de juger (perturbation). Une valeur exclue devient `missing` (`D-EXCL`).

## 3. Signe secondaire : pic de glaire ou de col

Le moteur lit **un seul** signe secondaire, choisi par l'utilisatrice (`mucus` ou `cervix`) ; l'autre est ignoré.

### 3.1 Pic (`M-PEAK` / `C-PEAK`)

- **Glaire** : le pic est le dernier jour de la meilleure qualité observée. Un pic n'est jamais recherché si la qualité maximale du cycle est < 2. Le pic est confirmé après **3 jours strictement moins fertiles** que lui.
- **Col** : même mécanisme ; « moins fertile » = fermé **et** ferme.

### 3.2 Double vérification : surveillance étendue (`M-EXT` / `C-EXT`)

Le pic reste sous surveillance jusqu'à la **fin de l'évaluation de température** (jour de validation de la hausse). Un nouveau signe aussi fertile que le pic (qualité ≥ pic ; col ouvert ou mou) pendant cette période **invalide** le pic : un nouveau pic est cherché après.

## 4. Combinaison des deux signes (`X-LATER`, `X-BLOCK`)

- Les deux signes (température, glaire/col) jouent **indépendamment** ; le changement de phase retenu est celui confirmé **le plus tard** (`X-LATER`).
- **Les deux** doivent être confirmés (`X-BLOCK`) : un seul signe ne suffit jamais à déclarer la phase post-ovulatoire.
- Si l'un des signes est bloquant au-delà du cycle courant, aucun verdict.

## 5. Phase pré-ovulatoire (`P-*`)

Sous conditions strictes, une fenêtre infertile en début de cycle (règles *first-five-days* et *minus-8*) :

- `P-NONE` : sans hausse confirmée dans le cycle précédent, **aucune** fenêtre pré-ovulatoire.
- `P-5DAY` : par défaut, 5 jours à partir de J1. La fenêtre s'arrête **avant** le premier jour observé sans signe secondaire applicable : l'absence de signal n'est pas de l'infertilité.
- `P-M8` : la fenêtre peut être étendue à `min(premiers points hauts des cycles précédents) − 8` jours. Ce plafond **raccourcit toujours** ; il n'allonge au-delà de 5 jours que s'il existe au moins **12 cycles** exploitables. `firstHighDay − 8 = 0` est légitime (`P-M8-ZERO`).
- `P-M8-GAP` : un cycle précédent illisible (refusé par `D-GAP-CONF` / `D-GAP-LTL` mais avec au moins une température) **plafonne** « moins 8 » à son premier jour candidat ; il ne l'allonge jamais. Un cycle précédent sans aucune température reste ignoré.
- `P-STOP` : tout signe fertile dans la fenêtre (glaire ≥ 2, col ouvert ou mou) arrête la fenêtre immédiatement : les jours suivants ne sont pas infertiles.

## 6. Surveillance après validation : `X-POST` (règle propre à Boussole, pas une règle de la méthode)

Règle propre à l'application : après la validation de la phase post-ovulatoire, le signe secondaire continue d'être lu chaque jour jusqu'à la fin du cycle.

- **Signe fertile** (glaire ≥ 2, col ouvert/mou) au jour `d > jour de validation` : la phase infertile s'arrête **avant** `d`, définitivement (warning `post_ovulatory_stopped_by_fertile_sign`).
- **Jour sans signe applicable** (rien de saisi, ou saisie exclue) : jour **incertain** (`uncertainDays`), jamais compté infertile (warning `post_ovulatory_day_unknown`). Le remplir plus tard le fait re-basculer.
- Fail-safe : `X-POST` ne peut que **retirer** des jours infertiles.

## 7. Table `ruleId` → section

| ruleId | Section |
|--------|---------|
| `T-ROUND`, plages, `S-START` | §1 |
| `T-LTL`, `D-GAP-LTL` | §2.1 |
| `T-STD`, `T-EX1`, `T-EX2` | §2.2 |
| `D-GAP-CONF` | §2.3 |
| `D-OUTLIER`, `D-EXCL` | §1, §2.4 |
| `M-PEAK`, `C-PEAK` | §3.1 |
| `M-EXT`, `C-EXT` | §3.2 |
| `X-LATER`, `X-BLOCK` | §4 |
| `P-NONE`, `P-5DAY`, `P-M8`, `P-M8-GAP`, `P-M8-ZERO`, `P-STOP` | §5 |
| `X-POST` | §6 |

L'implémentation de chaque règle est tracée dans [`RULES.md`](RULES.md) et prouvée par la fixture golden correspondante dans `test/golden/fixtures/`.
