// Apply a hand-vetted map of fill_blank fixes. Updates question/answer/accept
// for the listed ids, keeping a canonical key order. Edit MAP, then run.
const fs = require("fs");
const path = require("path");

const MAP = {
  // Daniel
  "daniel-11-q4": {
    question: "The people who know their God will firmly _____ him.",
    answer: "resist", accept: ["resist", "action"],
  },
  "daniel-11-q5": {
    question: "Those with insight will _____ many, though for a time they fall.",
    answer: "instruct", accept: ["instruct", "understand"],
  },
  "daniel-8-q5": {
    question: "Daniel was exhausted and lay _____ for some days after the vision.",
    answer: "ill", accept: ["ill", "sick"],
  },
  // Ruth
  "ruth-2-q5": {
    question: "Boaz was a close _____ of Naomi's family, one of their kinsman-redeemers.",
    answer: "relative", accept: ["relative", "kinsman"],
  },
  // Psalms
  "psalms-10-q5": {
    question: "You note mischief and grief, to repay it by Your _____.",
    answer: "hand", accept: ["hand", "hands"],
  },
  "psalms-103-q4": {
    question: "Bless the LORD, O my soul, and do not forget all His kind _____.",
    answer: "deeds", accept: ["deeds", "benefits"],
  },
  "psalms-104-q4": {
    question: "O LORD, how _____ are your works! In wisdom have you made them all.",
    answer: "many", accept: ["many", "manifold"],
  },
  "psalms-106-q4": {
    question: "Give thanks to the LORD, for He is good; His loving _____ endures forever.",
    answer: "devotion", accept: ["devotion", "love", "mercy", "kindness"],
  },
  "psalms-108-q5": {
    question: "With God we will perform with _____; it is He who will trample our foes.",
    answer: "valor", accept: ["valor", "valiantly"],
  },
  "psalms-109-q5": {
    question: "Help me, O LORD my God; save me according to Your loving _____.",
    answer: "devotion", accept: ["devotion", "love", "mercy", "kindness"],
  },
  "psalms-11-q4": {
    question: "The LORD is righteous; He loves _____.",
    answer: "justice", accept: ["justice", "righteousness"],
  },
  "psalms-11-q5": {
    question: "The LORD's eyes are watching closely; they _____ the sons of men.",
    answer: "examine", accept: ["examine", "test", "try"],
  },
  "psalms-12-q4": {
    question: "The words of the LORD are _____ words.",
    answer: "flawless", accept: ["flawless", "pure"],
  },
  "psalms-123-q4": {
    question: "To you I lift up my eyes, O you who are enthroned in _____!",
    answer: "heaven", accept: ["heaven", "heavens"],
  },
  "psalms-126-q5": {
    question: "The LORD has done great things for us; we are filled with _____.",
    answer: "joy", accept: ["joy", "glad", "gladness"],
  },
  "psalms-128-q4": {
    question: "Blessed is everyone who _____ the LORD, who walks in his ways!",
    answer: "fears", accept: ["fears", "fear"],
  },
  "psalms-128-q5": {
    question: "You shall eat the fruit of your _____; you shall be blessed.",
    answer: "labor", accept: ["labor", "hands"],
  },
  "psalms-13-q4": {
    question: "But I have trusted in Your loving _____.",
    answer: "devotion", accept: ["devotion", "love", "mercy", "kindness"],
  },
  "psalms-13-q5": {
    question: "I will sing to the LORD, for He has been _____ to me.",
    answer: "good", accept: ["good", "bountifully"],
  },
  "psalms-131-q4": {
    question: "O LORD, my heart is not proud; my eyes are not _____.",
    answer: "haughty", accept: ["haughty", "lofty", "raised too high"],
  },
  "psalms-133-q4": {
    question: "Behold, how good and pleasant it is when brothers live together in _____!",
    answer: "harmony", accept: ["harmony", "unity"],
  },
  "psalms-140-q5": {
    question: "I know that the LORD upholds justice for the _____ and defends the cause of the needy.",
    answer: "poor", accept: ["poor", "afflicted"],
  },
  "psalms-143-q5": {
    question: "Let me hear Your loving _____ in the morning, for in you I trust.",
    answer: "devotion", accept: ["devotion", "love", "mercy", "kindness"],
  },
  "psalms-145-q4": {
    question: "The LORD is gracious and compassionate, slow to anger and abounding in loving _____.",
    answer: "devotion", accept: ["devotion", "love", "mercy", "kindness"],
  },
  "psalms-148-q4": {
    question: "Praise the LORD from the heavens; praise him in the _____ places!",
    answer: "highest", accept: ["highest", "heights"],
  },
  "psalms-15-q4": {
    question: "He who does these things will never be _____.",
    answer: "shaken", accept: ["shaken", "moved"],
  },
  "psalms-18-q5": {
    question: "This God, his way is perfect; the word of the LORD is _____.",
    answer: "flawless", accept: ["flawless", "true", "tried"],
  },
  "psalms-19-q4": {
    question: "The heavens declare the glory of God; the skies proclaim the work of His _____.",
    answer: "hands", accept: ["hands", "handiwork"],
  },
  "psalms-20-q5": {
    question: "May He give you the _____ of your heart and make all your plans succeed.",
    answer: "desires", accept: ["desires", "desire"],
  },
  "psalms-27-q4": {
    question: "Wait patiently for the LORD; be strong and _____.",
    answer: "courageous", accept: ["courageous", "courage"],
  },
  "psalms-27-q5": {
    question: "The LORD is the stronghold of my life — whom shall I _____?",
    answer: "dread", accept: ["dread", "afraid", "fear"],
  },
  "psalms-3-q5": {
    question: "Many were saying of David, 'God will not _____ him.'",
    answer: "deliver", accept: ["deliver", "save", "help", "salvation"],
  },
  "psalms-34-q4": {
    question: "I will bless the LORD at all times; His praise will always be on my _____.",
    answer: "lips", accept: ["lips", "mouth"],
  },
  "psalms-37-q4": {
    question: "Commit your way to the LORD; trust in Him, and He will _____ it.",
    answer: "do", accept: ["do", "act"],
  },
  "psalms-37-q5": {
    question: "The steps of a man are ordered by the LORD, who takes _____ in his journey.",
    answer: "delight", accept: ["delight", "delights"],
  },
  "psalms-38-q4": {
    question: "Do not forsake me, O LORD! Come quickly to help me, O Lord my _____!",
    answer: "Savior", accept: ["Savior", "salvation"],
  },
  "psalms-39-q5": {
    question: "Surely each man is but a _____!",
    answer: "vapor", accept: ["vapor", "breath"],
  },
  "psalms-40-q4": {
    question: "He set my feet upon a rock and made my footsteps _____.",
    answer: "firm", accept: ["firm", "secure"],
  },
  "psalms-40-q5": {
    question: "I proclaim _____ in the great assembly; I do not seal my lips.",
    answer: "righteousness", accept: ["righteousness", "deliverance"],
  },
  "psalms-43-q4": {
    question: "Vindicate me, O God, and plead my _____ against an ungodly nation.",
    answer: "case", accept: ["case", "cause"],
  },
  "psalms-45-q5": {
    question: "In colorful _____ she is led to the king; her companions follow her.",
    answer: "garments", accept: ["garments", "robes"],
  },
  "psalms-47-q4": {
    question: "How _____ is the LORD Most High, the great King over all the earth!",
    answer: "awesome", accept: ["awesome", "feared"],
  },
  "psalms-49-q4": {
    question: "A man, despite his wealth, cannot _____; he is like the beasts that perish.",
    answer: "endure", accept: ["endure", "remain", "abide"],
  },
  "psalms-50-q4": {
    question: "Sacrifice a thank _____ to God, and fulfill your vows to the Most High.",
    answer: "offering", accept: ["offering", "thanksgiving"],
  },
  "psalms-50-q5": {
    question: "Call upon Me in the day of trouble; I will deliver you, and you will _____ Me.",
    answer: "honor", accept: ["honor", "glorify"],
  },
  "psalms-58-q5": {
    question: "The wicked are estranged from the womb; the _____ go astray from birth.",
    answer: "liars", accept: ["liars", "lies"],
  },
  "psalms-60-q4": {
    question: "With God we will do valiantly; it is He who will trample our _____.",
    answer: "enemies", accept: ["enemies", "foes", "adversaries"],
  },
  "psalms-60-q5": {
    question: "Give us aid against the enemy, for the _____ of man is worthless.",
    answer: "help", accept: ["help", "salvation"],
  },
  "psalms-66-q4": {
    question: "Come and see the works of God; how awesome are His deeds toward _____.",
    answer: "mankind", accept: ["mankind", "man", "men"],
  },
  "psalms-66-q5": {
    question: "Blessed be God, who has not rejected my prayer or withheld from me His loving _____!",
    answer: "devotion", accept: ["devotion", "love", "mercy", "kindness"],
  },
  "psalms-68-q5": {
    question: "Sing to God, sing praises to His name; lift up a song to Him who rides on the _____.",
    answer: "clouds", accept: ["clouds", "deserts", "heavens"],
  },
  "psalms-70-q5": {
    question: "May those who love your salvation always say, 'Let God be _____!'",
    answer: "magnified", accept: ["magnified", "great", "exalted"],
  },
  "psalms-72-q5": {
    question: "Blessed be the LORD, the God of Israel, who alone does marvelous _____.",
    answer: "deeds", accept: ["deeds", "things"],
  },
  "psalms-74-q5": {
    question: "Remember how the enemy has _____ You, O LORD.",
    answer: "mocked", accept: ["mocked", "scoffs", "reproached"],
  },
  "psalms-78-q5": {
    question: "He split the sea and let them pass through, and set the waters upright like a _____.",
    answer: "wall", accept: ["wall", "heap"],
  },
  "psalms-8-q4": {
    question: "From the mouths of children and infants You have ordained _____.",
    answer: "praise", accept: ["praise", "strength"],
  },
  "psalms-83-q4": {
    question: "O God, be not _____; do not hold your peace.",
    answer: "silent", accept: ["silent", "silence"],
  },
  "psalms-84-q5": {
    question: "Blessed are those whose strength is in you, whose hearts are set on _____.",
    answer: "pilgrimage", accept: ["pilgrimage", "highways"],
  },
  "psalms-89-q4": {
    question: "I will sing of the loving _____ of the LORD forever.",
    answer: "devotion", accept: ["devotion", "love", "mercy", "kindness"],
  },
  "psalms-9-q5": {
    question: "The nations have fallen into a pit of their own _____.",
    answer: "making", accept: ["making", "made"],
  },
  "psalms-92-q4": {
    question: "It is good to _____ the LORD and to sing praises to Your name.",
    answer: "praise", accept: ["praise", "thanks", "give thanks"],
  },
  "psalms-98-q4": {
    question: "Oh sing to the LORD a new song, for he has done _____!",
    answer: "wonders", accept: ["wonders", "marvelous", "marvellous"],
  },
  // Job
  "job-1-q5": { answer: "wrongdoing", accept: ["wrongdoing", "wrong"] },
  "job-11-q4": { answer: "limit", accept: ["limit", "limits"] },
  "job-13-q5": {
    question: "Job asked God to withdraw His hand and not let His _____ frighten him.",
    answer: "terror", accept: ["terror", "dread"],
  },
  "job-15-q5": {
    question: "Eliphaz said even the heavens are not pure in God's _____.",
    answer: "eyes", accept: ["eyes", "sight"],
  },
  "job-16-q4": {
    question: "Job said God had bound him, and it had become a _____ that testified against him.",
    answer: "witness", accept: ["witness", "byword"],
  },
  "job-19-q4": {
    question: "Job pleaded with his friends, 'Have pity on me, for the hand of God has _____ me.'",
    answer: "struck", accept: ["struck", "touched"],
  },
  "job-19-q5": {
    question: "Job wished his words were inscribed in stone with an iron _____ forever.",
    answer: "stylus", accept: ["stylus", "pen"],
  },
  "job-22-q4": {
    question: "Eliphaz told Job to return to the Almighty and he would be _____.",
    answer: "restored", accept: ["restored", "built up"],
  },
  "job-23-q4": {
    question: "Job said God knows the way he has _____.",
    answer: "taken", accept: ["taken", "takes"],
  },
  "job-25-q5": {
    question: "Bildad said dominion and awe belong to God, who establishes _____ in the heights of heaven.",
    answer: "harmony", accept: ["harmony", "peace"],
  },
  "job-3-q4": {
    question: "Job asked why light is given to the _____, and life to the bitter of soul.",
    answer: "miserable", accept: ["miserable", "misery"],
  },
  "job-31-q4": {
    question: "Job denied rejoicing in his _____'s ruin or exulting when evil befell him.",
    answer: "enemy", accept: ["enemy", "hated"],
  },
  "job-31-q5": {
    question: "Job said if his land cried out against him, let _____ grow instead of wheat.",
    answer: "briers", accept: ["briers", "thorns", "thistles"],
  },
  "job-34-q4": {
    question: "Elihu said God's eyes are on the ways of a man, and He sees his every _____.",
    answer: "step", accept: ["step", "steps", "goings"],
  },
  "job-36-q4": {
    question: "Elihu said, 'Behold, God is great — beyond our _____.'",
    answer: "knowledge", accept: ["knowledge", "know"],
  },
  "job-40-q5": {
    question: "Job said, 'I have spoken once, but I have no answer — twice, but I have nothing to _____.'",
    answer: "add", accept: ["add"],
  },
  "job-41-q4": {
    question: "God asked if Job could pull in Leviathan with a _____.",
    answer: "hook", accept: ["hook", "fishhook", "fish hook"],
  },
  "job-41-q5": {
    question: "God said Leviathan is king over all the _____.",
    answer: "proud", accept: ["proud", "pride"],
  },
  "job-42-q4": { answer: "eye", accept: ["eye", "eyes"] },
  // Proverbs
  "proverbs-10-q4": {
    question: "Hatred stirs up dissension, but love covers all _____.",
    answer: "transgressions", accept: ["transgressions", "offenses", "sins", "wrongs"],
  },
  "proverbs-11-q5": {
    question: "A generous soul will prosper, and he who _____ others will himself be refreshed.",
    answer: "refreshes", accept: ["refreshes", "waters"],
  },
  "proverbs-15-q5": {
    question: "Better is a little with the fear of the LORD than great treasure with _____.",
    answer: "turmoil", accept: ["turmoil", "trouble"],
  },
  "proverbs-16-q5": {
    question: "Commit your work to the LORD, and your plans will be _____.",
    answer: "achieved", accept: ["achieved", "established", "succeed"],
  },
  "proverbs-24-q5": {
    question: "A righteous man may fall seven times, yet he still _____ up.",
    answer: "gets", accept: ["gets", "rises"],
  },
  "proverbs-25-q5": {
    question: "If your enemy is hungry, give him _____ to eat.",
    answer: "food", accept: ["food", "bread"],
  },
  "proverbs-29-q5": {
    question: "The fear of man is a snare, but whoever trusts in the LORD is set securely on _____.",
    answer: "high", accept: ["high", "safe"],
  },
  "proverbs-4-q4": {
    question: "Guard your heart with all _____, for from it flow the springs of life.",
    answer: "diligence", accept: ["diligence", "vigilance"],
  },
  "proverbs-4-q5": {
    question: "Wisdom is supreme; so acquire wisdom. And whatever you may acquire, gain _____.",
    answer: "understanding", accept: ["understanding", "insight"],
  },
  "proverbs-8-q4": {
    question: "The LORD created me as His first course, before His _____ of old.",
    answer: "works", accept: ["works", "work", "way"],
  },
  "proverbs-9-q4": {
    question: "The fear of the LORD is the beginning of wisdom, and knowledge of the Holy One is _____.",
    answer: "understanding", accept: ["understanding", "insight"],
  },
  // Isaiah
  "isaiah-1-q5": {
    question: "Wash yourselves; make yourselves clean; stop doing evil; learn to do _____.",
    answer: "right", accept: ["right", "good", "well"],
  },
  "isaiah-16-q4": {
    question: "We have heard of Moab's pomposity, his exceeding pride and _____.",
    answer: "conceit", accept: ["conceit", "insolence"],
  },
  "isaiah-16-q5": { answer: "judges", accept: ["judges", "judge", "judging"] },
  "isaiah-19-q5": {
    question: "Blessed be Egypt My people, Assyria My handiwork, and Israel My _____.",
    answer: "inheritance", accept: ["inheritance", "heritage"],
  },
  "isaiah-20-q5": {
    question: "Behold, this is what has happened to our source of _____, those to whom we fled for help.",
    answer: "hope", accept: ["hope", "hoped", "expectation"],
  },
  "isaiah-23-q5": { answer: "king", accept: ["king", "king's"] },
  "isaiah-25-q5": {
    question: "For You have worked _____ — plans formed long ago — in perfect faithfulness.",
    answer: "wonders", accept: ["wonders", "things"],
  },
  "isaiah-29-q4": { answer: "heart", accept: ["heart", "hearts"] },
  "isaiah-35-q5": {
    question: "The redeemed of the LORD will return and enter Zion with singing, _____ with everlasting joy.",
    answer: "crowned", accept: ["crowned"],
  },
  "isaiah-37-q5": { answer: "185", accept: ["185", "185,000"] },
  "isaiah-39-q4": {
    question: "Nothing is left, said Hezekiah; they have seen all that is in my _____.",
    answer: "palace", accept: ["palace", "house"],
  },
  "isaiah-41-q5": {
    question: "I am the LORD your God, who takes hold of your right hand and says: Do not fear, I will _____ you.",
    answer: "help", accept: ["help", "helps"],
  },
  "isaiah-51-q5": {
    question: "My salvation will last forever, and My righteousness will never _____.",
    answer: "fail", accept: ["fail", "dismayed", "abolished"],
  },
  "isaiah-52-q5": {
    question: "Behold, My Servant will prosper; He will be raised and lifted up and _____ exalted.",
    answer: "highly", accept: ["highly", "greatly"],
  },
  "isaiah-58-q5": {
    question: "Share your bread with the hungry, and bring the poor and homeless into your _____.",
    answer: "home", accept: ["home", "house"],
  },
  "isaiah-59-q4": {
    question: "Your iniquities have built _____ between you and your God.",
    answer: "barriers", accept: ["barriers", "separation"],
  },
  "isaiah-8-q4": {
    question: "The LORD of Hosts you shall regard as holy; only He should be feared, only He should be _____.",
    answer: "dreaded", accept: ["dreaded", "dread"],
  },
  // Jeremiah
  "jeremiah-16-q4": {
    question: "Behold, I am sending for many _____, declares the LORD, and they will catch them.",
    answer: "fishermen", accept: ["fishermen", "fishers"],
  },
  "jeremiah-19-q4": {
    question: "I will shatter this people and this city, like a potter's jar that can never again be _____.",
    answer: "repaired", accept: ["repaired", "mended"],
  },
  "jeremiah-19-q5": { answer: "Hinnom", accept: ["Hinnom", "Ben-hinnom"] },
  "jeremiah-22-q5": {
    question: "Woe to him who makes his countrymen serve without _____ and fails to pay their wages.",
    answer: "pay", accept: ["pay", "wages", "nothing"],
  },
  "jeremiah-30-q4": {
    question: "The days are coming when I will restore My people Israel and Judah from _____.",
    answer: "captivity", accept: ["captivity", "fortunes"],
  },
  "jeremiah-32-q5": {
    question: "Ah, Lord GOD! ... Nothing is too _____ for You.",
    answer: "difficult", accept: ["difficult", "hard"],
  },
  "jeremiah-34-q4": {
    question: "You took back the male and female slaves you had set at _____.",
    answer: "liberty", accept: ["liberty", "free"],
  },
  "jeremiah-35-q4": { answer: "Rechabites", accept: ["Rechabites", "Rechab"] },
  "jeremiah-39-q4": { answer: "Zedekiah", accept: ["Zedekiah", "Zedekiah's"] },
  "jeremiah-39-q5": {
    question: "Nebuchadnezzar gave orders that Jeremiah be looked after and that no _____ come to him.",
    answer: "harm", accept: ["harm", "harmed"],
  },
  "jeremiah-5-q4": {
    question: "See if you can find a single person, anyone who acts _____ and seeks the truth.",
    answer: "justly", accept: ["justly", "justice", "judgment"],
  },
  "jeremiah-50-q5": {
    question: "In those days the guilt of Israel will be sought, but there will be none, for I will _____ the remnant I preserve.",
    answer: "forgive", accept: ["forgive", "pardon"],
  },
  // Ezekiel
  "ezekiel-1-q5": {
    question: "The vision came to Ezekiel among the exiles by the River _____.",
    answer: "Kebar", accept: ["Kebar", "Chebar"],
  },
  "ezekiel-10-q4": {
    question: "The glory of the LORD rose from the cherubim and stood over the threshold of the _____.",
    answer: "temple", accept: ["temple", "house"],
  },
  "ezekiel-12-q5": {
    question: "None of My words will be delayed any longer; the message I speak will be _____.",
    answer: "fulfilled", accept: ["fulfilled", "performed", "done"],
  },
  "ezekiel-15-q5": {
    question: "The fire has consumed both ends and the middle is charred; can it be useful for _____?",
    answer: "anything", accept: ["anything", "work"],
  },
  "ezekiel-19-q5": {
    question: "This is a lament and shall be used as a _____.",
    answer: "lament", accept: ["lament", "lamentation"],
  },
  "ezekiel-22-q4": {
    question: "I searched for a man among them to repair the wall and stand in the _____ before Me.",
    answer: "gap", accept: ["gap", "breach"],
  },
  "ezekiel-22-q5": {
    question: "Her prophets whitewash these deeds with false visions and _____ divinations.",
    answer: "lying", accept: ["lying", "lies"],
  },
  "ezekiel-23-q5": {
    question: "You must bear the consequences of your indecency and _____.",
    answer: "prostitution", accept: ["prostitution", "whoring", "whoredoms"],
  },
  "ezekiel-28-q5": {
    question: "You were blameless in your ways from the day you were created, until _____ was found in you.",
    answer: "wickedness", accept: ["wickedness", "unrighteousness", "iniquity"],
  },
  "ezekiel-29-q5": { answer: "reed", accept: ["reed", "reeds"] },
  "ezekiel-32-q4": {
    question: "You consider yourself a lion of the nations, but you are like a _____ in the seas.",
    answer: "monster", accept: ["monster", "dragon", "whale"],
  },
  "ezekiel-33-q4": {
    question: "If the watchman sees the sword coming and fails to blow the _____, the blood is on the watchman.",
    answer: "horn", accept: ["horn", "trumpet"],
  },
  "ezekiel-34-q5": {
    question: "I myself will tend My _____ and make them lie down, declares the Lord GOD.",
    answer: "flock", accept: ["flock", "sheep"],
  },
  "ezekiel-35-q4": {
    question: "Because you harbored an ancient _____, I will give you over to bloodshed.",
    answer: "hatred", accept: ["hatred", "enmity", "hostility"],
  },
  "ezekiel-40-q5": { answer: "gates", accept: ["gates", "gate"] },
  "ezekiel-45-q4": {
    question: "Put away violence and oppression, O princes of Israel, and do what is just and _____.",
    answer: "right", accept: ["right", "righteousness"],
  },
  "ezekiel-47-q5": {
    question: "Wherever the river flows, everything will _____.",
    answer: "flourish", accept: ["flourish", "live"],
  },
  "ezekiel-7-q5": {
    question: "They will throw their silver into the streets, and their gold will seem _____.",
    answer: "unclean", accept: ["unclean"],
  },
  // Leviticus
  "leviticus-10-q4": {
    question: "Nadab and Abihu offered _____ fire that God had not commanded them.",
    answer: "unauthorized", accept: ["unauthorized", "strange"],
  },
  "leviticus-19-q5": {
    question: "You are to rise in the presence of the elderly and honor the _____.",
    answer: "aged", accept: ["aged", "old", "elderly"],
  },
  "leviticus-2-q5": { answer: "leaven", accept: ["leaven", "yeast"] },
  "leviticus-22-q5": {
    question: "No one outside a priest's _____ may eat the sacred offering.",
    answer: "family", accept: ["family", "household"],
  },
  "leviticus-24-q4": {
    question: "Twelve loaves baked from fine _____ were arranged before the LORD, one for each tribe.",
    answer: "flour", accept: ["flour", "bread"],
  },
  "leviticus-8-q4": { answer: "ear", accept: ["ear", "earlobe"] },
  "leviticus-9-q5": {
    question: "When the people saw it, they shouted for joy and fell _____.",
    answer: "facedown", accept: ["facedown", "faces"],
  },
  // Numbers
  "numbers-1-q4": {
    question: "Moses counted the men twenty years old and upward who could serve in Israel's _____.",
    answer: "army", accept: ["army", "war"],
  },
  "numbers-21-q4": {
    question: "Whoever was bitten and looked at the bronze _____ would live.",
    answer: "snake", accept: ["snake", "serpent"],
  },
  "numbers-22-q5": { answer: "donkey", accept: ["donkey", "donkey's", "ass"] },
  "numbers-30-q5": {
    question: "A man must not break his word; he must do everything he has _____.",
    answer: "promised", accept: ["promised"],
  },
  "numbers-31-q4": { answer: "Midian", accept: ["Midian", "Midianites"] },
  "numbers-32-q4": { answer: "Gad", accept: ["Gad", "Gadites"] },
  "numbers-33-q4": { answer: "journey", accept: ["journey", "journeys"] },
  "numbers-4-q5": { answer: "Kohath", accept: ["Kohath", "Kohathites"] },
  // Deuteronomy
  "deuteronomy-13-q5": { answer: "test", accept: ["test", "testing", "prove"] },
  "deuteronomy-17-q5": {
    question: "The king was to write a copy of this _____ and read it all his days.",
    answer: "instruction", accept: ["instruction", "law"],
  },
  "deuteronomy-21-q4": {
    question: "A man hanged on a tree was not to remain overnight, for he is under God's _____.",
    answer: "curse", accept: ["curse", "cursed", "accursed"],
  },
  "deuteronomy-22-q5": {
    question: "If you see your brother's donkey fallen on the road, you must not _____ it.",
    answer: "ignore", accept: ["ignore", "hide"],
  },
  "deuteronomy-23-q5": {
    question: "If a man made a vow to the LORD, he was not to be slow to _____ it.",
    answer: "keep", accept: ["keep", "pay"],
  },
  "deuteronomy-25-q5": { answer: "Amalek", accept: ["Amalek", "Amalekites"] },
  "deuteronomy-34-q4": { answer: "120", accept: ["120", "a hundred and twenty", "one hundred twenty"] },
  // Genesis
  "genesis-10-q4": { answer: "Babylon", accept: ["Babylon", "Babel"] },
  "genesis-16-q4": { answer: "hears", accept: ["hears", "heard"] },
  "genesis-16-q5": {
    question: "The angel of the LORD found Hagar by a spring in the _____.",
    answer: "desert", accept: ["desert", "wilderness"],
  },
  "genesis-18-q4": {
    question: "The LORD asked, 'Is anything too _____ for the LORD?'",
    answer: "difficult", accept: ["difficult", "hard"],
  },
  "genesis-19-q5": { answer: "Ammon", accept: ["Ammon", "Ammonites", "Ben-ammi"] },
  "genesis-28-q4": { answer: "stone", accept: ["stone", "stones"] },
  "genesis-39-q5": {
    question: "Joseph ran from Potiphar's wife, leaving his _____ in her hand.",
    answer: "cloak", accept: ["cloak", "garment"],
  },
  "genesis-43-q5": {
    question: "Jacob told his sons to take a gift and double the _____ to return what was in their sacks.",
    answer: "silver", accept: ["silver", "money"],
  },
  "genesis-44-q4": { answer: "Benjamin", accept: ["Benjamin", "Benjamin's"] },
  "genesis-46-q4": {
    question: "God said, 'I will go down with you into Egypt, and I will surely bring you _____.'",
    answer: "back", accept: ["back", "up"],
  },
  "genesis-7-q5": { answer: "six", accept: ["six", "6"] },
  // Exodus
  "exodus-1-q5": {
    question: "Pharaoh ordered that every Hebrew son be cast into the _____.",
    answer: "Nile", accept: ["Nile", "river"],
  },
  "exodus-10-q5": {
    question: "The darkness over Egypt was so thick it was _____.",
    answer: "palpable", accept: ["palpable", "felt"],
  },
  "exodus-16-q5": {
    question: "Manna kept overnight (except before the Sabbath) bred _____ and began to smell.",
    answer: "maggots", accept: ["maggots", "worms"],
  },
  "exodus-9-q5": {
    question: "The plague of boils came from handfuls of _____ that Moses tossed toward the sky.",
    answer: "soot", accept: ["soot", "ashes"],
  },
  // 1 Chronicles
  "1-chronicles-16-q4": {
    question: "Give thanks to the LORD; call upon His name; make known His deeds among the _____!",
    answer: "nations", accept: ["nations", "peoples", "people"],
  },
  "1-chronicles-18-q5": {
    question: "David reigned over all Israel and administered justice and _____ for all his people.",
    answer: "righteousness", accept: ["righteousness", "equity", "justice"],
  },
  "1-chronicles-25-q5": { answer: "song", accept: ["song", "songs", "singing", "music"] },
  "1-chronicles-28-q5": {
    question: "If you seek Him, He will be found by you; but if you forsake Him, He will _____ you forever.",
    answer: "reject", accept: ["reject", "cast off"],
  },
  // 2 Chronicles
  "2-chronicles-1-q4": { answer: "horses", accept: ["horses", "horsemen"] },
  "2-chronicles-13-q5": { answer: "David", accept: ["David", "David's"] },
  "2-chronicles-16-q4": {
    question: "Hanani said the eyes of the LORD roam to and fro to support those whose hearts are fully _____ to Him.",
    answer: "devoted", accept: ["devoted", "blameless", "perfect"],
  },
  "2-chronicles-17-q4": {
    question: "Jehoshaphat's heart took _____ in the ways of the LORD.",
    answer: "delight", accept: ["delight"],
  },
  "2-chronicles-17-q5": {
    question: "He removed the high places and the _____ from Judah.",
    answer: "Asherah poles", accept: ["Asherah poles", "Asherim", "groves", "Asherah"],
  },
  "2-chronicles-18-q5": {
    question: "Ahab put Micaiah in prison and fed him only bread and water until he returned _____.",
    answer: "safely", accept: ["safely", "peace"],
  },
  "2-chronicles-19-q4": {
    question: "Jehoshaphat told the judges that with the LORD there is no injustice or partiality or _____.",
    answer: "bribery", accept: ["bribery", "bribes", "gifts"],
  },
  "2-chronicles-20-q4": {
    question: "Jehoshaphat said, 'Believe in the LORD your God, and you will be _____.'",
    answer: "upheld", accept: ["upheld", "established"],
  },
  "2-chronicles-26-q4": {
    question: "When Uzziah became powerful, his _____ led to his own destruction.",
    answer: "arrogance", accept: ["arrogance", "pride", "proud"],
  },
  "2-chronicles-29-q5": {
    question: "The service of the house of the LORD was restored, because everything had been accomplished so _____.",
    answer: "quickly", accept: ["quickly", "suddenly"],
  },
  "2-chronicles-30-q4": {
    question: "They kept the Feast of Unleavened Bread with great _____ for seven days.",
    answer: "joy", accept: ["joy", "gladness"],
  },
  "2-chronicles-5-q4": {
    question: "The singers praised the LORD, saying, 'For He is good; His _____ endures forever.'",
    answer: "loving devotion", accept: ["loving devotion", "steadfast love", "mercy", "loving kindness"],
  },
  "2-chronicles-8-q5": { answer: "Israel", accept: ["Israel", "Israelites"] },
  // 1 Samuel
  "1-samuel-11-q5": { answer: "kingship", accept: ["kingship", "kingdom"] },
  "1-samuel-12-q4": { answer: "praying", accept: ["praying", "pray"] },
  "1-samuel-14-q5": { answer: "honey", accept: ["honey", "honeycomb"] },
  "1-samuel-15-q4": {
    question: "Behold, _____ is better than sacrifice, and attentiveness is better than the fat of rams.",
    answer: "obedience", accept: ["obedience", "obey"],
  },
  "1-samuel-21-q5": { answer: "mad", accept: ["mad", "madness", "insane"] },
  "1-samuel-29-q4": { answer: "commanders", accept: ["commanders", "princes"] },
  "1-samuel-9-q4": {
    question: "Saul was without equal among the Israelites — a head _____ than any of the people.",
    answer: "taller", accept: ["taller", "higher"],
  },
  // 2 Samuel
  "2-samuel-10-q4": { answer: "beards", accept: ["beards", "beard"] },
  "2-samuel-15-q5": { answer: "fled", accept: ["fled", "flee"] },
  "2-samuel-24-q4": { answer: "census", accept: ["census", "number", "registering"] },
  "2-samuel-8-q4": { answer: "victory", accept: ["victory", "victorious"] },
  "2-samuel-8-q5": {
    question: "David reigned over all Israel, administering justice and _____ for all his people.",
    answer: "righteousness", accept: ["righteousness", "right"],
  },
  // 1 Kings
  "1-kings-7-q4": {
    question: "Solomon also built his own _____, which took thirteen years.",
    answer: "palace", accept: ["palace", "house"],
  },
  // 2 Kings
  "2-kings-19-q5": { answer: "185", accept: ["185", "185,000"] },
  "2-kings-24-q4": { answer: "vassal", accept: ["vassal", "servant"] },
  // Esther
  "esther-10-q4": {
    question: "King Xerxes imposed tribute throughout the land, even to its farthest _____.",
    answer: "shores", accept: ["shores", "sea"],
  },
  "esther-10-q5": {
    question: "Mordecai the Jew was second only to King _____.",
    answer: "Xerxes", accept: ["Xerxes", "Ahasuerus"],
  },
  "esther-6-q5": { answer: "Jew", accept: ["Jew", "Jewish"] },
  // Ezra
  "ezra-4-q4": {
    question: "The enemies offered to help build, claiming that, like Israel, they too _____ Israel's God.",
    answer: "seek", accept: ["seek", "sought", "worship", "worshiped"],
  },
  "ezra-8-q5": {
    question: "The hand of their God was on them to protect them from the _____ along the way.",
    answer: "enemies", accept: ["enemies", "enemy"],
  },
  // Nehemiah
  "nehemiah-1-q4": { answer: "Israel", accept: ["Israel", "Israelites"] },
  "nehemiah-1-q5": {
    question: "Nehemiah reminded God of His promise to gather the exiles even from the farthest _____.",
    answer: "horizon", accept: ["horizon", "heaven", "heavens"],
  },
  "nehemiah-13-q4": {
    question: "Nehemiah threw all of Tobiah's household goods out of the _____.",
    answer: "room", accept: ["room", "chamber"],
  },
  "nehemiah-13-q5": {
    question: "Nehemiah repeatedly prayed, 'Remember me, O my God, with _____.'",
    answer: "favor", accept: ["favor", "good"],
  },
  "nehemiah-2-q4": {
    question: "Nehemiah told the people, 'Come, let us rebuild the wall of Jerusalem, so that we will no longer be a _____.'",
    answer: "disgrace", accept: ["disgrace", "reproach", "derision"],
  },
  "nehemiah-2-q5": {
    question: "Nehemiah said the God of heaven would grant them _____, so they should arise and build.",
    answer: "success", accept: ["success", "prosper"],
  },
  "nehemiah-5-q5": {
    question: "Nehemiah shook out the folds of his _____ as a symbol against those who broke the promise.",
    answer: "robe", accept: ["robe", "garment", "lap"],
  },
  "nehemiah-7-q4": {
    question: "Some priests were excluded as unclean because their names were not found in the family _____.",
    answer: "records", accept: ["records", "genealogy", "register"],
  },
  "nehemiah-7-q5": { answer: "forty-two", accept: ["forty-two", "42", "forty two"] },
  // Ecclesiastes
  "ecclesiastes-1-q4": {
    question: "Futility of futilities, says the Teacher; everything is _____.",
    answer: "futile", accept: ["futile", "vanity", "meaningless"],
  },
  "ecclesiastes-3-q4": {
    question: "For everything there is a season, and a time for every _____ under heaven.",
    answer: "purpose", accept: ["purpose", "matter"],
  },
  "ecclesiastes-7-q4": {
    question: "A good name is better than fine _____.",
    answer: "perfume", accept: ["perfume", "ointment"],
  },
  "ecclesiastes-7-q5": {
    question: "Consider the work of God: who can straighten what He has _____?",
    answer: "bent", accept: ["bent", "crooked"],
  },
  "ecclesiastes-8-q5": {
    question: "It will be well with those who fear God, who are reverent in His _____.",
    answer: "presence", accept: ["presence"],
  },
  // Song of Solomon
  "song-of-solomon-1-q5": { answer: "Solomon", accept: ["Solomon", "Solomon's"] },
  "song-of-solomon-3-q4": {
    question: "On my bed at night I sought the one I _____; I sought him, but did not find him.",
    answer: "love", accept: ["love", "loves"],
  },
  "song-of-solomon-3-q5": {
    question: "Behold, it is _____ carriage, escorted by sixty mighty men of Israel.",
    answer: "Solomon's", accept: ["Solomon's", "Solomon"],
  },
  "song-of-solomon-6-q4": {
    question: "I belong to my beloved and he belongs to _____.",
    answer: "me", accept: ["me", "mine"],
  },
  "song-of-solomon-7-q5": {
    question: "Come, my beloved, let us go to the _____.",
    answer: "countryside", accept: ["countryside", "fields", "field"],
  },
  "song-of-solomon-8-q5": {
    question: "Mighty waters cannot quench love; rivers cannot _____ it away.",
    answer: "sweep", accept: ["sweep", "drown"],
  },
  // Joshua
  "joshua-14-q5": { answer: "85", accept: ["85", "eighty-five", "eighty five"] },
  // Judges
  "judges-11-q5": { answer: "Ammon", accept: ["Ammon", "Ammonites"] },
  "judges-20-q4": { answer: "Benjamin", accept: ["Benjamin", "Benjamites", "Benjamin's"] },
  "judges-3-q5": { answer: "Caleb", accept: ["Caleb", "Caleb's"] },
  "judges-7-q4": { answer: "300", accept: ["300", "three hundred"] },
  "judges-7-q5": {
    question: "Gideon's men blew their _____ and broke their jars, and the enemy fled.",
    answer: "horns", accept: ["horns", "trumpets"],
  },
  // Matthew
  "matthew-14-q5": {
    question: "The disciples picked up twelve basketfuls of broken _____ that were left over.",
    answer: "pieces", accept: ["pieces", "fragments"],
  },
  "matthew-16-q4": {
    question: "For what will it profit a man if he gains the whole world, yet forfeits his _____?",
    answer: "soul", accept: ["soul", "life"],
  },
  "matthew-18-q4": {
    question: "For where two or three gather together in My name, there am I _____ them.",
    answer: "with", accept: ["with"],
  },
  "matthew-2-q5": {
    question: "Warned in a dream not to return to Herod, they withdrew to their own country by another _____.",
    answer: "route", accept: ["route", "way"],
  },
  "matthew-26-q4": {
    question: "Watch and pray so that you will not enter into temptation. The spirit is willing, but the _____ is weak.",
    answer: "body", accept: ["body", "flesh"],
  },
  "matthew-9-q4": {
    question: "The harvest is plentiful, but the _____ are few.",
    answer: "workers", accept: ["workers", "laborers", "labourers"],
  },
  // Mark
  "mark-12-q5": {
    question: "She, out of her poverty, has _____ in all she had to live on.",
    answer: "put", accept: ["put"],
  },
  "mark-16-q5": {
    question: "Go into all the world and preach the gospel to every _____.",
    answer: "creature", accept: ["creature", "creation"],
  },
  "mark-4-q5": {
    question: "There is nothing hidden that will not be _____, and nothing concealed that will not be brought to light.",
    answer: "disclosed", accept: ["disclosed", "known", "manifested"],
  },
  "mark-7-q4": {
    question: "From within the hearts of men come evil thoughts, sexual immorality, _____, murder, and adultery.",
    answer: "theft", accept: ["theft", "thefts"],
  },
  // Luke
  "luke-1-q4": {
    question: "No word from God will ever _____.",
    answer: "fail", accept: ["fail"],
  },
  "luke-10-q4": {
    question: "The harvest is plentiful, but the _____ are few.",
    answer: "workers", accept: ["workers", "laborers", "labourers"],
  },
  "luke-12-q4": {
    question: "Do not be afraid, little flock, for your Father is _____ to give you the kingdom.",
    answer: "pleased", accept: ["pleased"],
  },
  "luke-14-q5": {
    question: "Salt is good, but if it loses its savor, with what will it be _____?",
    answer: "seasoned", accept: ["seasoned", "season"],
  },
  "luke-15-q4": {
    question: "There will be more joy in heaven over one sinner who repents than over ninety-nine righteous ones who do not need to _____.",
    answer: "repent", accept: ["repent", "repentance"],
  },
  "luke-22-q5": {
    question: "The greatest among you should be like the _____, and the one who leads like the one who serves.",
    answer: "youngest", accept: ["youngest", "younger"],
  },
  "luke-6-q4": {
    question: "Do not condemn, and you will not be condemned. _____, and you will be forgiven.",
    answer: "Forgive", accept: ["Forgive"],
  },
  // John
  "john-10-q4": {
    question: "I am the _____. If anyone enters through Me, he will be saved.",
    answer: "gate", accept: ["gate", "door"],
  },
  "john-16-q4": {
    question: "In the world you will have _____. But take courage; I have overcome the world!",
    answer: "tribulation", accept: ["tribulation", "trouble"],
  },
  "john-21-q5": {
    question: "They caught a large number of fish — one hundred and _____-three — yet the net was not torn.",
    answer: "fifty", accept: ["fifty", "50"],
  },
  // Acts
  "acts-1-q5": {
    question: "Suddenly two men dressed in _____ stood beside them.",
    answer: "white", accept: ["white"],
  },
  "acts-10-q4": {
    question: "God has shown me that I should not call any _____ impure or unclean.",
    answer: "man", accept: ["man", "person"],
  },
  "acts-10-q5": {
    question: "While Peter was still speaking, the Holy Spirit fell upon all who heard his _____.",
    answer: "message", accept: ["message", "word"],
  },
  "acts-14-q4": {
    question: "We must endure many _____ to enter the kingdom of God.",
    answer: "hardships", accept: ["hardships", "tribulations", "afflictions"],
  },
  "acts-17-q5": {
    question: "The Bereans were more _____ than the Thessalonians, for they received the message with great eagerness.",
    answer: "noble-minded", accept: ["noble-minded", "noble"],
  },
  "acts-22-q5": {
    question: "Ananias told Paul, 'Get up, be _____, and wash your sins away, calling on His name.'",
    answer: "baptized", accept: ["baptized"],
  },
  "acts-23-q4": {
    question: "The following night, the Lord stood near Paul and said, 'Take _____!'",
    answer: "courage", accept: ["courage", "cheer"],
  },
  // Romans
  "romans-1-q5": {
    question: "God's invisible qualities have been clearly seen since the creation of the world, being understood from His _____.",
    answer: "workmanship", accept: ["workmanship"],
  },
  "romans-13-q5": {
    question: "Clothe yourselves with the Lord Jesus Christ, and make no provision for the _____ of the flesh.",
    answer: "desires", accept: ["desires", "lusts"],
  },
  "romans-15-q5": {
    question: "Everything that was written in the past was written for our _____, so that through endurance and encouragement we might have hope.",
    answer: "instruction", accept: ["instruction", "learning"],
  },
  // 1 Corinthians
  "1cor-12-q5": {
    question: "If one part suffers, every part _____ with it.",
    answer: "suffers", accept: ["suffers", "suffer"],
  },
  "1cor-14-q4": {
    question: "In the church I would rather speak five _____ words to instruct others than ten thousand words in a tongue.",
    answer: "coherent", accept: ["coherent", "understanding"],
  },
  "1cor-14-q5": {
    question: "For God is not a God of _____ but of peace.",
    answer: "disorder", accept: ["disorder", "confusion"],
  },
  "1cor-5-q4": {
    question: "A little _____ works through the whole batch of dough.",
    answer: "leaven", accept: ["leaven", "yeast"],
  },
  "1cor-7-q4": {
    question: "Each one should remain in the _____ he was in when he was called.",
    answer: "situation", accept: ["situation", "condition", "calling"],
  },
  // 2 Corinthians
  "2cor-2-q5": {
    question: "Thanks be to God, who always leads us _____ as captives in Christ.",
    answer: "triumphantly", accept: ["triumphantly", "triumph"],
  },
  "2cor-3-q5": {
    question: "Where the Spirit of the Lord is, there is _____.",
    answer: "freedom", accept: ["freedom", "liberty"],
  },
  "2cor-6-q5": {
    question: "What partnership can righteousness have with _____?",
    answer: "wickedness", accept: ["wickedness", "lawlessness", "unrighteousness", "iniquity"],
  },
};

const ORDER = ["id", "type", "question", "options", "answer", "accept", "verse_reference"];
function reorder(q) {
  const out = {};
  for (const k of ORDER) if (k in q) out[k] = q[k];
  for (const k of Object.keys(q)) if (!(k in out)) out[k] = q[k];
  return out;
}

const QDIR = "data/questions";
let applied = 0;
const ids = new Set(Object.keys(MAP));
for (const book of fs.readdirSync(QDIR)) {
  const dir = path.join(QDIR, book);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const fp = path.join(dir, file);
    const data = JSON.parse(fs.readFileSync(fp, "utf8"));
    let dirty = false;
    data.questions = (data.questions || []).map((q) => {
      const m = MAP[q.id];
      if (!m) return q;
      if (m.question) q.question = m.question;
      q.answer = m.answer;
      q.accept = m.accept;
      ids.delete(q.id);
      applied++;
      dirty = true;
      return reorder(q);
    });
    if (dirty) fs.writeFileSync(fp, JSON.stringify(data, null, 2) + "\n");
  }
}
console.log(`Applied ${applied} fixes.`);
if (ids.size) console.log(`NOT FOUND (check ids): ${[...ids].join(", ")}`);
