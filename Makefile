test:
	npm test

setup:
	npm ci
	npm link

lint:
	npx eslint .

lint-fix:
	npx eslint --fix .

coverage:
	npm run test -- --coverage

dependencies:
	npm install