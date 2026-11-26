# Contrat du moteur

Document de référence : tout le code s’aligne sur ce contrat. Les types ci-dessous sont la source de vérité ; les JSDoc dans `src` doivent les refléter.


## 1. Entrée

```
EngineInput = {
  cycle: CycleDay[],                 // jours calendaires CONSÉCUTIFS, cycle[0] = J1 (saignement présent)
  previousCycles?: CycleDay[][],     // du plus récent au plus ancien, même contrainte
  secondarySymptom: 'mucus' | 'cervix',
  options?: { ltlWindowMaxDays?: number }   // défaut 9
}

CycleDay = {
  date: 'YYYY-MM-DD',
  bleeding?:    { value: 0|1|2|3, excluded?: boolean },        // spotting / léger / moyen / abondant
  temperature?: { celsius: number, excluded?: boolean, time?: 'HH:mm' },
  mucus?:       { quality: 0|1|2|3|4, excluded?: boolean },    // mapping observation→qualité fait par l'app
  cervix?:      { opening: 0|1|2, firmness: 0|1, excluded?: boolean }
}
```

- Un jour **sans observation** est **présent** dans `cycle` (champs absents).
- Un jour **exclu** (`excluded: true`) ≡ absent pour le calcul (parenthèses de la méthode) mais reste visible dans l’app.
- Dates non consécutives, valeurs hors plage, J1 sans saignement ⇒ `InputError` typée.
- L’**adaptateur app** (lignes SQL → tableau calendaire complet) est le seul responsable de cette conversion. C’est ce qui ferme un bug classique (positions de tableau vs jours) à deux niveaux.
- Pas de `new Date()` dans le moteur. « Aujourd’hui » est injecté par l’app.

## 2. Sortie

```
EngineOutput = {
  evaluable: boolean,
  reasons: [{ code, ruleId, day, date, message }],
  phases: {
    preOvulatory?: { startDay, endDay, startDate, endDate, ruleId },
    periOvulatory:  { startDay, startDate, endDay?, endDate? },
    postOvulatory?: { startDay, startDate, time: '18:00',
                      stopDay?, stopDate?, stopRuleId?: 'X-POST',   // §2 ter
                      uncertainDays?: number[] }                    // §2 ter
  },
  temperatureShift?: {
    detected, ruleId: 'T-STD'|'T-EX1'|'T-EX2',
    ltl, firstHighDay, firstHighDate,
    evaluationCompleteDay, evaluationCompleteDate
  },
  secondaryShift?: {
    kind: 'mucus'|'cervix', ruleId,
    peakDay, peakDate,
    evaluationCompleteDay, evaluationCompleteDate
  },
  warnings: [{ code, day, date, message }],
  trace:    [{ ruleId, day?, detail }],
  progress: Progress                        // §2 bis
}
```

Fail-safe : `evaluable: false` ⇒ aucune phase infertile déclarée. Le moteur ne devine jamais.

## 2 ter. Surveillance post-ovulatoire (règle propre à Boussole, issue #86 - actée le 19/10/2026)

Ce n'est **pas** une règle de la méthode : le doc arrête de regarder la glaire à la fin de l'évaluation de la température. Décision de l’auteur (01/10 puis 15/10) : après la validation de la phase post-ovulatoire, la glaire (ou le col) continue d'être lue chaque jour jusqu'à la fin du cycle. Identifiant de règle : `X-POST`.


Pour chaque jour `d` du cycle avec `d > postOvulatory.startDay` (le jour de validation lui-même n'est pas concerné) :

1. **Signe fertile** : glaire de qualité ≥ 2 (même seuil que `P-STOP`), ou col ouvert/mou (`isFertileCervix`) selon `secondarySymptom`. Le premier jour `d` concerné devient `stopDay` : la phase infertile s'arrête avant ce jour, pour le reste du cycle. Elle ne reprend pas. Avertissement `post_ovulatory_stopped_by_fertile_sign` au jour `stopDay`.
2. **Jour sans signe applicable** (aucune saisie, ou saisie exclue - D-EXCL) : le jour est listé dans `uncertainDays` et n'est jamais compté infertile. Il suffit de le remplir pour qu'il cesse d'être incertain (rattrapage). Les jours suivants, saisis et non fertiles, restent infertiles : un trou de plusieurs jours (ex. J18 et J19) rend ces jours incertains, et une glaire non fertile notée en J20 ramène J20 en infertile sans qu'il faille remplir J18 ni J19 . Avertissement `post_ovulatory_day_unknown` par jour.
3. Les jours d'après `stopDay` ne sont ni lus ni listés dans `uncertainDays`.
4. Sans `stopDay` ni `uncertainDays` (ou si le moteur ne déclare pas de phase post-ovulatoire), la sortie est identique à celle d'avant cette règle.

Jours infertiles post-ovulatoires = `startDay .. min(longueur, stopDay − 1)` moins `uncertainDays`.

Fail-safe : cette règle ne peut que **retirer** des jours infertiles, jamais en ajouter.

## 2 bis. Relevé `progress` (ajout du 25 septembre 2026)

`progress` raconte ce que la boucle de décision a vu, au moment où elle décide. C'est une sortie seulement : le moteur ne la relit jamais, et elle n'ajoute aucune entrée. Tous les autres champs de la sortie restent identiques au bit près à ceux du moteur gelé le 25 septembre 2026 (`test/differential/reference-2026-09-25`). Pas de cache : le moteur refait le même relevé à chaque calcul.

```
Progress = {
  temperature: {
    state: 'collecting'   // aucun décompte ouvert : on attend un jour au-dessus de sa ligne
         | 'counting'     // un décompte attend des jours pas encore dans le cycle
         | 'confirmed'    // hausse confirmée (= temperatureShift)
         | 'stopped'      // décompte arrêté par un trou (= reason gap_in_confirmation_window)
         | 'refused',     // ligne impossible (= reason insufficient_low_readings)
    baseline: null | {    // rempli pour 'collecting' et 'refused'
      forDay, forDate,    // 'collecting' : dernier jour du cycle ; 'refused' : jour du refus
      state: 'building' | 'ready' | 'spread',   // < 6 relevés / ligne prête / 6 relevés étalés sur plus de windowMax jours
      readings: [{ day, date, celsius }],       // 0 à 6 relevés, du plus ancien au plus récent
      ltl?: number,                             // si 'ready'
      windowMax: number                         // 9 par défaut
    },
    count: null | Count,  // le décompte qui a conclu, ou le plus ancien ouvert
    history: Count[]      // décomptes écartés avant lui, dans l'ordre (outcome 'rejected')
  },
  secondary: null | {     // null quand la température a déjà rendu le cycle non évaluable
    kind: 'mucus' | 'cervix',
    state: 'noPeak' | 'counting' | 'confirmed' | 'stopped' | 'blocked',
    peakSearchUntil: number,     // pic cherché jusqu'à ce jour (jour de fin de la hausse, sinon dernier jour)
    peakSearchClosed: boolean,   // true si la hausse est confirmée : le pic ne peut plus bouger
    peakDay?, peakDate?,
    marks: [{ mark: 1|2|3, day, date,        // [] si 'noPeak'
              state: 'lower'       // plus basse que le pic (col : fermé et dur)
                   | 'notLower'    // aussi fertile que le pic : 'blocked'
                   | 'missing' | 'upcoming' | 'notNeeded' }]
  }
}

Count = {
  firstHighDay, firstHighDate,
  ltl: number, ltlReadings: [{ day, date, celsius }],   // les 6 relevés de la ligne
  rule: 'T-STD' | 'T-EX1' | 'T-EX2',   // règle en jeu (conclue si outcome 'confirmed')
  outcome: 'open' | 'confirmed' | 'rejected' | 'stopped',
  endDay: number | null, endDate: string | null,   // jour qui conclut, écarte ou arrête
  next: 1|2|3|4 | null,                // prochain repère attendu si 'open'
  marks: [{                            // toujours 4 repères : Jour 1 à Jour 4
    mark: 1|2|3|4, day, date,
    celsius: number | null,
    state: 'above'       // au-dessus de la ligne
         | 'notAbove'    // au niveau de la ligne ou en dessous
         | 'missing'     // jour du cycle sans relevé valable (absent ou exclu)
         | 'upcoming'    // pas encore un jour du cycle
         | 'optional'    // Jour 4 : on ne sait pas encore s'il servira
         | 'notNeeded',  // le décompte a conclu avant ce repère
    target: null | { op: '>' | '>=', celsius },   // condition de la règle en jeu pour ce repère
    met: boolean | null                            // null si la valeur n'est pas connue
  }]
}
```

- Cibles : Jour 1 et Jour 2 > ligne ; Jour 3 ≥ ligne + 0,20 si le Jour 2 est au-dessus, sinon > ligne (exception 2) ; Jour 4 > ligne (exception 1) ou ≥ ligne + 0,20 (exception 2), `null` tant qu'aucune exception n'est en jeu.
- « Aujourd'hui non saisi » n'existe pas dans le moteur : c'est un jour du cycle sans relevé (`missing`). L'app, qui connaît aujourd'hui, l'affiche comme tel.
- Un relevé exclu est `missing`, comme un relevé absent (§9). L'app sait lesquels sont entre parenthèses.

## 3. Codes `reason` (refus d’évaluer)

| code | ruleId | Signification |
|------|--------|---------------|
| `gap_in_measurements` | D-GAP-LTL / D-GAP-CONF | Série calendaire ininterprétable |
| `insufficient_low_readings` | D-GAP-LTL | Moins de 6 relevés valables dans `ltlWindowMaxDays` |
| `gap_in_confirmation_window` | D-GAP-CONF | Jour manquant/exclu dans J+1..J+3/+4 ou 3 jours post-pic |
| `missing_day1_bleeding` | S-START | J1 sans saignement ≥ léger |
| `non_consecutive_dates` | - | InputError : dates trouées (refus avant calcul) |
| `out_of_range` | D-OUTLIER | Valeur hors plage plausible (InputError si absurde ; warning si suspecte) |

## 4. Codes `warning` (jamais d’exclusion automatique)

| code | Signification |
|------|----------------|
| `possible_outlier_temperature` | Pic isolé **en phase basse** (avant le 1er point haut d'une hausse confirmée) → suggestion « perturbation ? » à l’utilisatrice (issue #11) |
| `cycle_too_long` | > 99 jours : warning, pas de rejet |
| `preovu_stopped_by_fertile_sign` | Fenêtre P-* interrompue (glaire ≥ 2 ou col ouvert/mou) |
| `post_ovulatory_stopped_by_fertile_sign` | Phase post-ovulatoire arrêtée par un signe fertile (§2 ter, `X-POST`) |
| `post_ovulatory_day_unknown` | Jour post-ovulatoire sans signe applicable : incertain (§2 ter, `X-POST`) |

La méthode laisse le jugement d’exclusion à l’utilisatrice. Le moteur **signale**, il n’écarte pas.

## 5. `InputError`

Erreur typée levée **avant** tout calcul, distincte de `evaluable: false` :

- `code`: `non_consecutive_dates` | `missing_day1_bleeding` | `invalid_date` | `out_of_range` | `empty_cycle`
- `message`: FR, relisible
- `day?`, `date?`

L’adaptateur ne doit jamais laisser une `InputError` de dates non consécutives remonter à l’UI comme un verdict - il construit d’abord le tableau calendaire complet.

## 6. Segmentation des cycles (`S-START`)

Dans le même paquet (`cycles.js`) :

- Début de cycle = premier jour de saignement ≥ léger (`bleeding.value >= 1`), sans saignement non exclu les 2 jours précédents.
- Spotting (`value: 0`) ne démarre pas un cycle.
- > 99 jours ⇒ `warning: cycle_too_long`, pas de rejet.

## 7. Politique de tolérance aux trous (à valider par une conseillère qualifiée de la méthode)

Proposition par défaut, **conservatrice** :

1. **Ligne de base (LTL)** : 6 relevés valables, en remontant à travers les jours manquants/exclus, **mais** ces 6 relevés doivent tenir dans les `ltlWindowMaxDays` = **9** derniers jours calendaires (≤ 3 jours manquants). Au-delà ⇒ `evaluable: false`, `insufficient_low_readings`. Le plafond est un **paramètre nommé**.
2. **Fenêtres de confirmation** (J+1..J+3/+4 après le 1er point haut ; 3 jours après le pic de glaire/col) : **strictes** - un jour manquant ou exclu ⇒ `gap_in_confirmation_window`. Plus prudent que la méthode de référence pour la température ; aligné sur « la glaire ne se rattrape pas ».
3. Règle-cadre : toute incertitude ⇒ pas de phase infertile.

## 8. Plages plausibles (détection, pas exclusion)

- Température : 35,0 °C - 38,5 °C. Hors plage ⇒ `InputError`. Pic isolé dans la plage ⇒ `possible_outlier_temperature`.
- Glaire qualité : 0-4. Col opening 0-2, firmness 0-1.

## 9. Invariants que les tests doivent garantir

- Verdict invariant si le même cycle est décalé sur 366 dates de départ (y compris 28 fév. → 1er mars, 31 déc. → 1er jan.).
- `excluded: true` ≡ champ absent pour le calcul.
- Trous ⇒ jamais plus de confiance (jamais plus de jours infertiles) qu’une série complète.
  - Borné aux paires évaluables (issue #74) : un refus (`evaluable: false`, §2 et §7) vaut 0 jour ; si le trou retire la donnée qui causait le refus, la série trouée redevient évaluable et retrouve sa fenêtre. Ce n'est pas une prolongation, c'est la levée d'un refus, et la propriété ne compare pas ces paires.
  - Fenêtre pré-ovulatoire (P-5DAY, P-M8, P-STOP) : elle s'arrête avant le premier jour observé sans signe secondaire applicable (absent ou entre parenthèses). Retirer un signe fertile ne l'allonge donc jamais (issue #74, graine `129473140`). Les jours pas encore écoulés ne sont pas des trous. À valider par une conseillère qualifiée de la méthode.
  - Anciens cycles illisibles (issue #130, décision option a, **actée le 19/11/2026**) : un cycle précédent que le moteur refuse de lire (D-GAP-CONF, D-GAP-LTL) plafonne « moins 8 » à son premier candidat, c'est-à-dire le premier jour au-dessus de la ligne de base même non confirmé (pour D-GAP-LTL : le jour où la ligne ne peut pas être posée). Il n'allonge donc pas la fenêtre. Un ancien cycle sans aucune température n'a pas de candidat : il reste ignoré, et un ancien cycle lisible sans hausse l'est aussi (comportement inchangé). Politique du moteur, absente de `SPEC.md` : à valider par une conseillère qualifiée de la méthode (plafonner ou mettre la fenêtre à 0). Fixtures `P-M8-GAP`, `P-M8-GAP-LTL`.
- Surveillance post-ovulatoire (§2 ter) : elle ne fait que retirer des jours infertiles ; un jour `uncertainDays` ou postérieur à `stopDay` n'est jamais infertile ; remplir un jour manquant avec une glaire non fertile ne rallonge que ce jour.
- Pureté : même entrée ⇒ même sortie ; pas d’I/O ; pas d’horloge.
- `progress` ne change aucune décision : sans lui, la sortie est identique à celle du moteur gelé le 25 septembre 2026 (propriété différentielle).
- `progress` colle à la décision : `confirmed` ⇔ hausse détectée (même Jour 1, même règle, même ligne, même fin) ; `stopped` / `refused` ⇔ la raison correspondante, même jour ; glaire ou col `confirmed` ⇔ `secondaryShift.detected`, même pic.
