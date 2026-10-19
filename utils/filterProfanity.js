// Masks bad words in review text with the `bad-words` package.
// bad-words v4 is an ES module, so it is loaded once with a dynamic import.
const EXTRA_WORDS = [
    // Filipino profanity carried over from the original PopStop filter
    'putangina', 'tangina', 'gago', 'bobo', 'tarantado', 'ulol', 'bwisit', 'leche', 'punyeta'
];

let filterPromise;

const getFilter = () => {
    if (!filterPromise) {
        filterPromise = import('bad-words').then(({ Filter }) => {
            const filter = new Filter();
            filter.addWords(...EXTRA_WORDS);
            return filter;
        });
    }
    return filterPromise;
}

const filterProfanity = async (text) => {
    if (!text) return '';
    const filter = await getFilter();
    return filter.clean(text);
}

const hasProfanity = async (text) => {
    if (!text) return false;
    const filter = await getFilter();
    return filter.isProfane(text);
}

module.exports = { filterProfanity, hasProfanity, EXTRA_WORDS };
