export default {
  extends: ['stylelint-config-standard'],
  customSyntax: 'postcss-html',
  ignoreFiles: ['dist/**/*', 'node_modules/**/*', '_refs/**/*'],
  rules: {
    'selector-class-pattern': null,
    'custom-property-pattern': null,
    'no-descending-specificity': null,
    'declaration-empty-line-before': null,
    'rule-empty-line-before': null,
    'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['deep', 'global', 'slotted'] }],
    'media-feature-range-notation': null,
    'alpha-value-notation': null,
    'color-function-notation': null
  }
}
