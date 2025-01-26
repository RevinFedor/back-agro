// module.exports = {
//   parser: '@typescript-eslint/parser',
//   parserOptions: {
//     project: 'tsconfig.json',
//     tsconfigRootDir: __dirname,
//     sourceType: 'module',
//   },
//   plugins: ['@typescript-eslint/eslint-plugin'],
//   extends: [
//     'plugin:@typescript-eslint/recommended-type-checked', // Изменено для фокуса на типах
//   ],
//   root: true,
//   env: {
//     node: true,
//     jest: true,
//   },
//   ignorePatterns: ['.eslintrc.js'],
//   rules: {
//     // Отключаем все строгие правила, оставляем только базовую типизацию
//     '@typescript-eslint/interface-name-prefix': 'off',
//     '@typescript-eslint/explicit-function-return-type': 'off',
//     '@typescript-eslint/explicit-module-boundary-types': 'off',
//     '@typescript-eslint/no-explicit-any': 'off',
//     '@typescript-eslint/no-unused-vars': 'warn', // Предупреждение вместо ошибки
//     '@typescript-eslint/no-empty-interface': 'warn',
//     '@typescript-eslint/no-empty-function': 'off',
//     '@typescript-eslint/no-inferrable-types': 'off',
//     'prettier/prettier': 'off', // Отключаем prettier, чтобы он не конфликтовал

//     // без типов и интерфесов
//     '@typescript-eslint/no-unsafe-return': 'off',
//     '@typescript-eslint/no-unsafe-assignment': 'off',
//     '@typescript-eslint/no-unsafe-member-access': 'off',
//     '@typescript-eslint/no-unsafe-argument': 'off',
//   },
// };
