// Each category needs exactly 5 clues, easiest first.
// Each game draws 12 categories at random (6 per round) and one Final clue.
// Add your own categories here to keep games fresh.

const categories = [
  {
    name: 'The Color Pie',
    clues: [
      { q: 'Lightning Bolt, Shock and Fireball are all spells of this color.', a: 'Red' },
      { q: "This color's basic land is the Plains.", a: 'White' },
      { q: 'In the color pie, this color is an enemy of both white and green.', a: 'Black' },
      { q: 'These two colors make up the Golgari Swarm.', a: 'Black and green' },
      { q: 'The Mardu Horde of Tarkir fights under these three colors.', a: 'Red, white and black' },
    ],
  },
  {
    name: 'Guilds of Ravnica',
    clues: [
      { q: "Ravnica's red-white guild of soldiers is this Legion.", a: 'Boros' },
      { q: 'This blue-black house of spies and secrets officially "doesn\'t exist."', a: 'House Dimir' },
      { q: 'This green-white guild is a nature-loving Conclave.', a: 'Selesnya' },
      { q: 'The dragon Niv-Mizzet founded this guild of inventors.', a: 'The Izzet League' },
      { q: 'This magical treaty bound the ten guilds of Ravnica.', a: 'The Guildpact' },
    ],
  },
  {
    name: 'Planeswalkers',
    clues: [
      { q: 'This blue mind mage was a founding member of the Gatewatch.', a: 'Jace Beleren' },
      { q: 'This fiery red pyromancer from Kaladesh shares her last name, Nalaar, with her inventor mother Pia.', a: 'Chandra' },
      { q: 'This elder dragon schemed his way into the War of the Spark on Ravnica.', a: 'Nicol Bolas' },
      { q: 'This necromancer made pacts with four demons to regain her youth.', a: 'Liliana Vess' },
      { q: 'This silver golem was built by Urza and later gained a planeswalker spark.', a: 'Karn' },
    ],
  },
  {
    name: 'Famous Cards',
    clues: [
      { q: 'For just one red mana, this instant deals 3 damage to any target.', a: 'Lightning Bolt' },
      { q: 'This 1-mana Alpha artifact taps for two colorless mana and is a Commander staple.', a: 'Sol Ring' },
      { q: 'For one blue mana, this Power Nine instant lets a player draw three cards.', a: 'Ancestral Recall' },
      { q: 'This Power Nine sorcery gives you an extra turn for 1U.', a: 'Time Walk' },
      { q: '"Destroy all creatures. They can\'t be regenerated." reads this classic white sorcery.', a: 'Wrath of God' },
    ],
  },
  {
    name: 'Magic History',
    clues: [
      { q: 'This mathematics professor designed Magic: The Gathering.', a: 'Richard Garfield' },
      { q: 'This Seattle-area company first published Magic in 1993.', a: 'Wizards of the Coast' },
      { q: 'Released in 1993, the very first Magic set is known by this Greek letter.', a: 'Alpha' },
      { q: 'This toy giant bought Wizards of the Coast in 1999.', a: 'Hasbro' },
      { q: "Magic's first expansion was based on this collection of Middle Eastern folk tales.", a: 'Arabian Nights' },
    ],
  },
  {
    name: 'Keywords',
    clues: [
      { q: 'A creature with this ability can only be blocked by creatures with this ability or reach.', a: 'Flying' },
      { q: 'This keyword lets a creature attack the turn it comes under your control.', a: 'Haste' },
      { q: 'Damage dealt by a creature with this keyword also causes its controller to gain that much life.', a: 'Lifelink' },
      { q: 'Any amount of damage from a source with this keyword is enough to destroy a creature.', a: 'Deathtouch' },
      { q: 'This keyword lets an attacker assign excess combat damage to the player or planeswalker it\'s attacking.', a: 'Trample' },
    ],
  },
  {
    name: 'Fill in the Creature',
    clues: [
      { q: 'Llanowar ____', a: 'Elves' },
      { q: 'Shivan ____', a: 'Dragon' },
      { q: 'Serra ____', a: 'Angel' },
      { q: 'Grizzly ____ (a vanilla 2/2 for 1G)', a: 'Bears' },
      { q: 'Tarmogoyf belongs to this creature type, also shared by Mortivore and Cognivore.', a: 'Lhurgoyf' },
    ],
  },
  {
    name: 'Planes of the Multiverse',
    clues: [
      { q: 'This city-covered plane is home to ten guilds.', a: 'Ravnica' },
      { q: 'Werewolves, vampires and zombies stalk this gothic horror plane.', a: 'Innistrad' },
      { q: 'This Egyptian-inspired plane awaited the return of the God-Pharaoh.', a: 'Amonkhet' },
      { q: 'Gods like Heliod and Thassa rule this plane inspired by Greek mythology.', a: 'Theros' },
      { q: 'Karn\'s metal plane of Mirrodin was conquered and renamed this.', a: 'New Phyrexia' },
    ],
  },
  {
    name: 'By the Numbers',
    clues: [
      { q: 'The starting life total in a standard two-player game.', a: '20' },
      { q: 'The starting life total in Commander.', a: '40' },
      { q: 'The minimum deck size in Constructed formats like Standard and Modern.', a: '60' },
      { q: 'A Commander deck contains exactly this many cards, commander included.', a: '100' },
      { q: 'The minimum deck size in Limited formats like Draft and Sealed.', a: '40' },
    ],
  },
  {
    name: 'The Zones',
    clues: [
      { q: 'Destroyed creatures go to this zone.', a: 'The graveyard' },
      { q: 'The official rules name for your deck during a game.', a: 'The library' },
      { q: 'Lands, creatures and other permanents exist in this zone.', a: 'The battlefield' },
      { q: 'Spells wait in this zone, last in, first out, before resolving.', a: 'The stack' },
      { q: 'Your commander starts the game in this zone.', a: 'The command zone' },
    ],
  },
  {
    name: 'Lands',
    clues: [
      { q: 'This basic land taps for green mana.', a: 'Forest' },
      { q: 'This basic land taps for black mana.', a: 'Swamp' },
      { q: 'Flooded Strand and Polluted Delta belong to this nickname-family of lands that sacrifice to search your library.', a: 'Fetch lands' },
      { q: 'This legendary Planeshift land makes every land a Swamp in addition to its other types.', a: 'Urborg, Tomb of Yawgmoth' },
      { q: 'This legendary land from Urza\'s Saga taps for G for each creature you control.', a: "Gaea's Cradle" },
    ],
  },
  {
    name: 'Spell Slinging',
    clues: [
      { q: 'For UU, this instant reads simply "Counter target spell."', a: 'Counterspell' },
      { q: 'For B and 2 life, this sorcery looks at an opponent\'s hand and makes them discard a nonland card.', a: 'Thoughtseize' },
      { q: 'For one green mana, this instant gives a creature +3/+3 until end of turn.', a: 'Giant Growth' },
      { q: 'This one-mana white instant exiles a creature; its controller gains life equal to its power.', a: 'Swords to Plowshares' },
      { q: 'This one-mana black instant adds BBB.', a: 'Dark Ritual' },
    ],
  },
  {
    name: 'Dominaria Lore',
    clues: [
      { q: 'These two brothers fought the Brothers\' War.', a: 'Urza and Mishra' },
      { q: 'Karn created this artificial metal plane.', a: 'Mirrodin' },
      { q: 'Led by Yawgmoth, these biomechanical horrors invaded Dominaria.', a: 'The Phyrexians' },
      { q: 'Teferi phased out this African-inspired Dominarian nation to protect it from the Phyrexian Invasion.', a: 'Zhalfir' },
      { q: 'Urza ended the Brothers\' War by activating this artifact, devastating Argoth.', a: 'The Golgothian Sylex' },
    ],
  },
  {
    name: 'It Debuted In...',
    clues: [
      { q: 'Landfall debuted on this adventure-world plane\'s 2009 set.', a: 'Zendikar' },
      { q: 'Morph, which lets you cast creatures face down as 2/2s for 3, debuted in this 2002 set.', a: 'Onslaught' },
      { q: 'Storm, the mechanic behind Tendrils of Agony, debuted in this final set of the Onslaught block.', a: 'Scourge' },
      { q: 'Infect, which deals damage as -1/-1 counters and poison counters, debuted in this 2010 set.', a: 'Scars of Mirrodin' },
      { q: 'Flashback, which lets you cast a spell from your graveyard, debuted in this 2001 set.', a: 'Odyssey' },
    ],
  },
];

const finals = [
  {
    category: 'Origin Story',
    q: 'Wizards of the Coast passed on this board game Richard Garfield first pitched, asking for a portable game instead. That ask led to Magic.',
    a: 'RoboRally',
  },
  {
    category: 'Famous Art',
    q: 'Christopher Rush painted the art for this Alpha artifact, now among the most valuable cards ever printed.',
    a: 'Black Lotus',
  },
  {
    category: 'Priceless Printings',
    q: 'A one-of-one serialized version of this card from the 2023 Lord of the Rings set reportedly sold for about $2 million.',
    a: 'The One Ring',
  },
];

for (const c of categories) {
  if (c.clues.length !== 5) throw new Error(`Category "${c.name}" must have exactly 5 clues`);
}
if (categories.length < 12) throw new Error('Need at least 12 categories');

module.exports = { categories, finals };
