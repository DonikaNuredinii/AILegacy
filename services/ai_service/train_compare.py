from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import MultinomialNB

from app.ml_engine import TRAINING_DATA

texts = [t for (t, y) in TRAINING_DATA]
labels = [y for (t, y) in TRAINING_DATA]

X_train, X_test, y_train, y_test = train_test_split(
    texts, labels, test_size=0.3, random_state=42, stratify=labels
)

vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1)
X_train_vec = vectorizer.fit_transform(X_train)
X_test_vec = vectorizer.transform(X_test)

models = {
    "LogisticRegression": LogisticRegression(max_iter=400),
    "MultinomialNB": MultinomialNB(),
}

for name, model in models.items():
    model.fit(X_train_vec, y_train)
    pred = model.predict(X_test_vec)

    print("\n==============================")
    print("Model:", name)
    print("Accuracy:", round(accuracy_score(y_test, pred), 4))
    print("Confusion Matrix:\n", confusion_matrix(y_test, pred))
    print("Classification Report:\n", classification_report(y_test, pred))