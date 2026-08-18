// Quick script to check localStorage in browser console
console.log('Rubrics in localStorage:', localStorage.getItem('hotrubric_rubrics'));
console.log('Courses in localStorage:', Object.keys(JSON.parse(localStorage.getItem('hotrubric_rubrics') || '{}')));
