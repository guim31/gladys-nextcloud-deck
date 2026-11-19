# Nextcloud Deck

Amenez les tableaux kanban de
[Nextcloud Deck](https://apps.nextcloud.com/apps/deck) dans Gladys : les
cartes dues aujourd'hui, celles en retard, la prochaine échéance et le nombre
de cartes de chaque liste d'un tableau. Une scène réagit quand une carte est
créée, arrive dans une liste (`Fait`, `À vérifier`…) ou arrive à échéance, une
autre ajoute « acheter du pain » depuis un bouton ou déplace une carte depuis
un tag NFC, un appui sur le tableau de bord marque une carte comme faite, et
Gladys peut lire les cartes du jour chaque matin.

Cette intégration ne couvre que l'application Deck. Pour surveiller le serveur
Nextcloud lui-même (stockage, utilisateurs, mises à jour), voyez l'intégration
Nextcloud.

> **Vos retours sont les bienvenus.** Cette intégration a été testée contre un
> vrai Nextcloud (image Docker `nextcloud` 31.0.14 avec Deck 1.15.12, novembre
> 2026), pas encore à l'usage au quotidien. Si quelque chose ne marche pas
> comme décrit, dites-le sur le
> [forum Gladys](https://community.gladysassistant.com) ou dans les
> [issues](https://github.com/guim31/gladys-nextcloud-deck/issues).

## Ce qu'il faut

- Gladys Assistant 5.1.0 ou plus récent.
- Un **Nextcloud avec l'application Deck** (testé avec Nextcloud 31 et
  Deck 1.15), joignable depuis Gladys. Marquer une carte comme faite demande
  Deck 1.13 ou plus récent.
- L'**identifiant** d'un utilisateur de Nextcloud et un **mot de passe
  d'application** : dans Nextcloud, **Paramètres personnels** → **Sécurité**
  → **Appareils & sessions** → **Créer un mot de passe d'application**.
  Copiez-le : Nextcloud ne l'affiche qu'une fois. Il marche avec la connexion
  à deux facteurs, et se révoque à tout moment sans changer le mot de passe du
  compte. Le mot de passe du compte marche aussi, sans connexion à deux
  facteurs, mais n'est pas recommandé.

L'intégration voit les tableaux que voit cet utilisateur (les siens et ceux
qu'on lui partage), et agit **en son nom**. Un utilisateur qui ne peut que
lire un tableau peut le suivre, mais pas en ajouter, déplacer ni marquer
comme faites les cartes.

## Configuration

1. Dans Gladys, **Intégrations** → installez **Nextcloud Deck**.
2. Dans l'écran **Configuration**, renseignez :
   - **Adresse** : l'adresse de Nextcloud comme dans le navigateur, par
     exemple `https://cloud.example.org`, ou `http://192.168.1.20:8080` (un
     chemin comme `/nextcloud` est conservé ; l'adresse copiée d'un tableau
     marche aussi) ;
   - **Identifiant** et **Mot de passe d'application**.
3. Options :
   - **Tableaux suivis** : des noms séparés par des virgules
     (`Maison, Courses`), ou le numéro d'un tableau (celui de son adresse).
     Vide : tous les tableaux de l'utilisateur, 20 au plus. Les tableaux
     archivés et ceux de la corbeille sont écartés ;
   - **Accepter les certificats auto-signés** : pour une adresse en
     `https://` avec un certificat auto-signé, sur votre propre serveur
     seulement ;
   - **Intervalle de rafraîchissement** : 1 à 10 minutes (5 par défaut). Les
     échéances et minuit sont toujours suivis à l'heure, quel que soit
     l'intervalle ;
   - **Langue des noms de fonctionnalités** : les noms donnés aux
     fonctionnalités à l'ajout d'un appareil (français par défaut), et les
     textes envoyés aux scènes.
4. Enregistrez, puis **Tester la connexion** : elle lit Deck et donne le
   nombre de cartes ouvertes et de tableaux suivis.
5. Dans l'onglet **Découverte**, ajoutez les appareils voulus.

## Appareils

**Deck _tableau_** pour chaque tableau suivi, avec ces fonctionnalités :

| Fonctionnalité            | Ce qu'elle indique                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `Cartes ouvertes`         | les cartes non marquées comme faites (les cartes archivées ne comptent jamais)               |
| `Cartes dues aujourd'hui` | les cartes ouvertes dont l'échéance tombe aujourd'hui, passée ou non                         |
| `Cartes en retard`        | les cartes ouvertes dont l'échéance est passée                                               |
| une par liste             | le nombre de cartes affichées dans chacune des cinq premières listes, au nom de la liste     |
| `Prochaine échéance`      | la carte dont l'échéance à venir est la plus proche, et sa date ; `Aucune` s'il n'y en a pas |

« Aujourd'hui » est le jour dans le fuseau horaire de Gladys. Une carte
marquée comme faite n'est plus due, mais compte encore dans sa liste, puisque
Deck l'y affiche toujours. Les noms des fonctionnalités sont fixés à l'ajout
de l'appareil : une liste renommée ensuite garde son ancien nom dans Gladys.
Une nouvelle liste parmi les cinq premières fait proposer la mise à jour de
l'appareil dans l'onglet **Découverte**.

## Tableau de bord

Le widget **Cartes du jour** affiche deux tuiles (aujourd'hui, en retard), la
liste des cartes à finir ce soir, celles en retard d'abord, avec leur heure,
leur liste et leur tableau (au nom donné dans Gladys une fois l'appareil
ajouté), et un bouton pour chacune des quatre plus urgentes : un appui marque
la carte comme faite dans Deck. Choisissez un appareil tableau dans les
réglages du widget pour ne voir que ses cartes ; laissez vide pour tous les
tableaux suivis. Décochez **Afficher les boutons « fait »** pour un écran en
lecture seule. Quand rien n'est dû, le widget le dit et donne la prochaine
échéance.

Les compteurs peuvent aussi aller sur le tableau de bord comme toute
fonctionnalité d'appareil.

## Scènes

### Déclencheurs

- **Nouvelle carte Deck** : une carte a été créée dans un tableau suivi.
  Filtres : le tableau (un appareil tableau), le **nom de la liste**,
  exactement comme dans Deck.
- **Carte Deck déplacée** : une carte est arrivée dans une autre liste de son
  tableau. Mêmes filtres (`Fait`). Elle transmet aussi la liste précédente.
- **Carte Deck à échéance** : une carte ouverte a atteint son échéance sans
  être marquée comme faite.
- **Carte Deck en retard** : à minuit, une carte due ce jour-là n'est
  toujours pas faite. Une fois par carte et par échéance.

Filtres des deux derniers : le tableau, le nom de la carte. Informations
transmises aux actions : la carte, son numéro, son tableau, sa liste, son
échéance.

Une nouvelle carte ou un déplacement se voit à la lecture suivante : dans
l'intervalle de rafraîchissement. Une carte sortie des archives, ou venue
d'un autre tableau, n'est ni nouvelle ni déplacée, et les cartes d'un tableau
suivi à partir de maintenant ne sont pas des nouveautés. Une carte marquée
comme faite avant son échéance ne déclenche rien, et une échéance déplacée à
la main avant la lecture précédente non plus. Un redémarrage ne déclenche
rien deux fois ; une carte créée ou déplacée pendant l'arrêt de l'intégration
déclenche à la reprise (créée moins d'une heure avant), de même qu'une
échéance de moins d'une heure.

### Actions

- **Ajouter une carte Deck** : un titre ; le tableau par son nom (vide : le
  premier tableau suivi) ; la liste par son nom (vide : sa première liste, à
  gauche) ; une **échéance** facultative, à l'heure de Gladys :
  `2026-10-24 18:00`, `2026-10-24` (midi), ou à partir de maintenant `+30m`,
  `+2h`, `+3d`. La carte va en bas de la liste. Résultats : la carte, son
  numéro, son tableau, sa liste, son échéance.
- **Déplacer une carte Deck** : la carte par son nom exact (majuscules et
  accents ignorés) ou son numéro, la liste de destination par son nom, et le
  tableau si deux tableaux ont une carte de ce nom. La carte va en bas de la
  liste. Résultats : la carte, son numéro, son tableau, sa liste, la liste
  précédente.
- **Lire les cartes Deck du jour** : les cartes à finir ce soir en une phrase
  (`3 carte(s) à finir ce soir : …. 2 en retard.`), pour tous les tableaux
  suivis ou l'un d'eux. Résultats : la phrase, le nombre de cartes à finir ce
  soir, de cartes en retard. Envoyez la phrase dans un message, ou faites-la
  dire par Gladys.

Les champs acceptent les variables de scène : `{{triggerEvent.data.card}}`
déplace la carte qui a déclenché la scène. Une action qui échoue (liste
introuvable, Deck injoignable) s'affiche en rouge avec sa raison.

### Idées de scènes

- À 7 h 30, **Lire les cartes Deck du jour**, puis envoyer la phrase sur
  Telegram.
- **Nouvelle carte Deck** dans le tableau `Courses` : l'envoyer à la famille.
- **Carte Deck déplacée** dans la liste `Fait` du tableau `Maison` : éteindre
  la lampe de rappel.
- Quand le lave-linge s'arrête, **Ajouter une carte Deck**
  `Étendre le linge` dans `À faire`, échéance `+1h`.
- Un tag NFC sur les poubelles lance **Déplacer une carte Deck**
  `Sortir les poubelles` vers `Fait`.

## Dépannage

- **« Nextcloud ne répond pas »** : vérifiez l'adresse et le port depuis la
  machine de Gladys (l'adresse ouvre Nextcloud dans un navigateur).
- **« Identifiant ou mot de passe d'application refusé »** : le mot de passe
  d'application a été révoqué, ou mal copié. Créez-en un nouveau. Après un
  refus, l'intégration attend l'intervalle de rafraîchissement avant de
  réessayer : Nextcloud ralentit, puis bloque, les connexions qui échouent à
  répétition.
- **« Trop de requêtes ou de connexions refusées »** : la protection contre
  la force brute de Nextcloud ; elle se lève d'elle-même, ou un
  administrateur lance `occ security:bruteforce:reset <adresse de Gladys>`.
- **« Aucune application Deck à cette adresse »** : installez et activez Deck
  dans Nextcloud (**Applications**), ou vérifiez l'adresse et son chemin.
- **« L'adresse redirige »** : saisissez l'adresse en `https://`.
- **« Nextcloud est en maintenance ou en mise à jour »** : attendez la fin de
  la mise à jour.
- **« Tableau disparu, ou cet utilisateur n'a pas le droit de le
  modifier »** : le tableau a été supprimé ou n'est plus partagé avec
  l'utilisateur, ou celui-ci ne peut que le lire.
- **Un tableau manque** : il doit être partagé avec l'utilisateur, et ni
  archivé ni dans la corbeille ; un nom saisi dans **Tableaux suivis** qui ne
  correspond à aucun tableau est ignoré, et **Tester la connexion** le
  signale. Au-delà de 20 tableaux, listez ceux à suivre.
- **« Plusieurs cartes portent ce nom »** : indiquez le tableau, ou le numéro
  de la carte.
- Journaux : `LOG_LEVEL=debug` sur le conteneur montre chaque lecture.

## Limites

- Deck est lu toutes les 1 à 10 minutes (et à chaque échéance et à minuit) :
  un changement dans Deck apparaît dans Gladys dans ce délai. Les
  notifications de Nextcloud ne servent pas.
- Une requête pour les tableaux, plus une par tableau suivi, à chaque
  lecture.
- L'intégration ajoute des cartes, les déplace et les marque comme faites ;
  elle ne les modifie pas, ne les supprime pas, ne les assigne pas, et ne lit
  ni leurs étiquettes, ni leurs commentaires, ni leurs pièces jointes.
  Marquer une carte comme faite la réécrit telle qu'elle a été lue juste
  avant : une modification faite dans Deck à la même seconde pourrait être
  perdue.
- Seules les cinq premières listes d'un tableau ont un compteur.
- Testé avec Nextcloud 31 et Deck 1.15.12.
- Gladys ne garde aucune donnée de Deck hors de `/data/deck-state.json`
  (l'heure de la dernière lecture, les tableaux suivis et la liste de chaque
  carte, pour qu'aucun événement ne parte deux fois).
- Sans lien avec Nextcloud GmbH.
